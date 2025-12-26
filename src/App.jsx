import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { 
    FileUp, Send, Loader2, AlertTriangle, CheckCircle, List, FileText, BarChart2,
    Save, Clock, Zap, ArrowLeft, Users, Briefcase, Layers, UserPlus, LogIn, Tag,
    Shield, User, HardDrive, Phone, Mail, Building, Trash2, Eye, DollarSign, Activity, 
    Printer, Download, MapPin, Calendar, ThumbsUp, ThumbsDown, Gavel, Paperclip, Copy, Award, Lock, CreditCard, Info,
    Scale, FileCheck, XCircle, Search, UserCheck, HelpCircle, GraduationCap, TrendingUp, Globe, Map, FileDown
} from 'lucide-react'; 

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail 
} from 'firebase/auth';
import { 
    getFirestore, collection, addDoc, onSnapshot, query, doc, setDoc, 
    runTransaction, deleteDoc, getDocs, getDoc, collectionGroup, orderBy, limit, where 
} from 'firebase/firestore'; 

// --- FIREBASE INITIALIZATION ---
// IMPORTANT: THESE ENV VARIABLES MUST BE SET IN VITE (e.g. .env.local)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase only once
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- CONSTANTS ---
const API_URL = '/api/analyze'; // Proxy endpoint for Google AI Studio

// Recruitment Categories for SmartHire (kept for schema consistency if needed later)
const CATEGORY_ENUM = ["MUST_HAVE_SKILL", "EXPERIENCE", "EDUCATION", "CERTIFICATION", "SOFT_SKILLS", "LOCATION/LANG", "CULTURE_FIT"];

const MAX_FREE_AUDITS = 1000000; // Effectively unlimited for now as per previous settings

const PAGE = {
    HOME: 'HOME',
    COMPLIANCE_CHECK: 'COMPLIANCE_CHECK', 
    ADMIN: 'ADMIN',                     
    HISTORY: 'HISTORY' 
};

// --- SMARTHIRE JSON SCHEMA (ADAPTED FOR SMARTBIDS) ---
// Note: Keeping the name SMARTHIRE_REPORT_SCHEMA for now as the structure is reused.
const SMARTHIRE_REPORT_SCHEMA = {
    type: "OBJECT",
    description: "Analysis Report comparing a Proposal (Bid) against an RFP/RFQ.",
    properties: {
        // --- HEADER DATA ---
        "jobRole": { "type": "STRING", "description": "The title or main subject of the RFP/RFQ." },
        "candidateName": { "type": "STRING", "description": "The name of the bidder/proposer company or individual." },
        // NEW FIELDS FOR GOD VIEW (Adapted for Bids)
        "candidateLocation": { "type": "STRING", "description": "Detected location of the bidder if present, else 'Unknown'." },
        "salaryIndication": { "type": "STRING", "description": "Total proposed price or budget indication if found, else 'Not Specified'." },
        
        // --- BIDDER HIGHLIGHTS ---
        "candidateSummary": {
            "type": "OBJECT",
            "properties": {
                // Using yearsExperienceNum as a proxy for relevant project experience years if mentioned
                "yearsExperienceNum": { "type": "NUMBER", "description": "Numeric value of relevant experience years mentioned (e.g., 5.5). Use 0 if none." },
                "currentRole": { "type": "STRING", "description": "Bidder's primary specialization or service offering related to the bid." },
                "educationLevel": { "type": "STRING", "description": "Key certifications or qualifications mentioned in the proposal." }
            }
        },

        // --- SUITABILITY METRICS ---
        "suitabilityScore": { 
            "type": "NUMBER", 
            "description": "0-100 Score. 100 = Perfect Compliance, 0 = Non-Compliant. Based on RFP requirements met." 
        },
        "fitLevel": { "type": "STRING", "enum": ["EXCELLENT FIT", "GOOD FIT", "AVERAGE", "POOR FIT"], "description": "Overall assessment of proposal compliance." },
        
        // --- GAP ANALYSIS (Red Lines / Deviation List) ---
        "skillGaps": { 
            "type": "ARRAY", 
            "items": { "type": "STRING" },
            "description": "List of missing mandatory requirements, deviations, or non-compliance issues." 
        },

        // --- CLARIFICATION STRATEGY ---
        "interviewQuestions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "topic": { "type": "STRING", "description": "The area of concern (e.g., 'Pricing Structure', 'Timeline Deviation')." },
                    "question": { "type": "STRING", "description": "A suggested question to ask the bidder for clarification." }
                }
            },
            "description": "3-5 suggested questions for the bidder to clarify ambiguities or weak points."
        },

        // --- DETAILED ANALYSIS ---
        "executiveSummary": { "type": "STRING", "description": "3-sentence summary of the proposal's strengths and weaknesses for the evaluator." },
        "findings": {
            "type": "ARRAY",
            "description": "Detailed line-by-line comparison against RFP requirements.",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "requirementFromJD": { "type": "STRING", "description": "Specific requirement extracted from the RFP/RFQ." },
                    "candidateEvidence": { "type": "STRING", "description": "Corresponding section or evidence found in the proposal." },
                    "matchScore": { 
                        "type": "NUMBER", 
                        "description": "1 = Full Compliance, 0.5 = Partial Compliance/Alternative offered, 0 = Non-Compliant/Missing." 
                    },
                    "flag": { "type": "STRING", "enum": ["MATCH", "PARTIAL", "MISSING"], "description": "Visual flag for compliance status." },
                    // Reusing category names but mapping conceptually: 
                    // MUST_HAVE_SKILL -> Mandatory Requirement
                    // EXPERIENCE -> Relevant Past Performance
                    // EDUCATION -> Certifications/Standards
                    // SOFT_SKILLS -> Methodology/Approach
                    // LOCATION/LANG -> Geographic/Language constraints
                    // CULTURE_FIT -> Terms & Conditions/Compliance
                    "category": { "type": "STRING", "enum": CATEGORY_ENUM },
                    "recruiterAction": { 
                        "type": "STRING", 
                        "description": "Evaluator advice: e.g., 'Acceptable deviation', 'Require clarification on X', 'Critical non-compliance'." 
                    }
                }
            }
        }
    },
    "required": ["jobRole", "candidateName", "candidateLocation", "salaryIndication", "suitabilityScore", "fitLevel", "candidateSummary", "skillGaps", "interviewQuestions", "executiveSummary", "findings"]
};

// --- UTILS ---
const fetchWithRetry = async (url, options, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error; 
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
};

// Using a generic tracker name for SmartBids usage
const getUsageDocRef = (db, userId) => doc(db, `users/${userId}/usage_limits`, 'smartbids_tracker');
// Keeping the collection name generic as per previous setup, though 'bid_reports' might be more fitting.
const getReportsCollectionRef = (db, userId) => collection(db, `users/${userId}/candidate_reports`);

const processFile = (file) => {
    return new Promise(async (resolve, reject) => {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const reader = new FileReader();
        if (fileExtension === 'txt') {
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        } else if (fileExtension === 'pdf') {
            if (typeof window.pdfjsLib === 'undefined') return reject("PDF lib not loaded.");
            reader.onload = async (event) => {
                try {
                    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(event.target.result) }).promise;
                    let fullText = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        fullText += textContent.items.map(item => item.str).join(' ') + '\n\n'; 
                    }
                    resolve(fullText);
                } catch (e) { reject(e.message); }
            };
            reader.readAsArrayBuffer(file);
        } else if (fileExtension === 'docx') {
            if (typeof window.mammoth === 'undefined') return reject("DOCX lib not loaded.");
            reader.onload = async (event) => {
                try {
                    const result = await window.mammoth.extractRawText({ arrayBuffer: event.target.result });
                    resolve(result.value); 
                } catch (e) { reject(e.message); }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reject('Unsupported file type.');
        }
    });
};

class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true }; }
    componentDidCatch(error, errorInfo) { this.setState({ error, errorInfo }); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-red-900 font-body p-8 text-white flex items-center justify-center">
                    <div className="bg-red-800 p-8 rounded-xl border border-red-500 max-w-lg">
                        <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-4"/>
                        <h2 className="text-xl font-bold mb-2">System Error</h2>
                        <p className="text-sm font-mono">{this.state.error && this.state.error.toString()}</p>
                    </div>
                </div>
            );
        }
        return this.props.children; 
    }
}

// --- LEAF COMPONENTS ---
const handleFileChange = (e, setFile, setErrorMessage) => {
    if (e.target.files.length > 0) {
        setFile(e.target.files[0]);
        if (setErrorMessage) setErrorMessage(null); 
    }
};

const FormInput = ({ label, name, value, onChange, type, placeholder, id, required = false }) => (
    <div>
        <label htmlFor={id || name} className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <input
            id={id || name}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder || ''}
            required={required}
            className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
    </div>
);

// SmartBids uses a different paywall structure than SmartHire currently.
const PaywallModal = ({ show, onClose }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
            <div className="bg-slate-800 rounded-2xl shadow-2xl border border-purple-500/50 max-w-md w-full p-8 text-center relative">
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-purple-600 rounded-full p-4 shadow-lg shadow-purple-500/50">
                    <Lock className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mt-8 mb-2">Bid Analysis Limit Reached</h2>
                <p className="text-slate-300 mb-6">
                    You have reached the limit for free bid analyses.
                    <br/>To continue optimizing your proposals, please upgrade.
                </p>
                <button 
                    onClick={() => alert("Upgrade feature coming soon!")}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-all shadow-lg mb-3 flex items-center justify-center"
                >
                    <CreditCard className="w-5 h-5 mr-2"/> Unlock Unlimited Access
                </button>
                <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">
                    Maybe Later (Return to Home)
                </button>
            </div>
        </div>
    );
};

const FileUploader = ({ title, file, setFile, color, requiredText, icon: Icon }) => (
    <div className={`p-6 border-2 border-dashed border-${color}-600/50 rounded-2xl bg-slate-900/50 space-y-3 no-print`}>
        <h3 className={`text-lg font-bold text-${color}-400 flex items-center`}>
            {Icon && <Icon className={`w-6 h-6 mr-2 text-${color}-500`} />} 
            {title}
        </h3>
        <p className="text-sm text-slate-400">{requiredText}</p>
        <input type="file" accept=".txt,.pdf,.docx" onChange={setFile} className="w-full text-base text-slate-300"/>
        {file && <p className="text-sm font-medium text-green-400 flex items-center"><CheckCircle className="w-4 h-4 mr-1 text-green-500" /> {file.name}</p>}
    </div>
);

// --- MID-LEVEL COMPONENTS (REPORT VIEW) ---

const ComplianceReport = ({ report }) => {
    const findings = report.findings || []; 
    // Adapt colours for bid compliance
    const fitColor = report.fitLevel === 'POOR FIT' ? 'text-red-500' 
        : report.fitLevel === 'AVERAGE' ? 'text-amber-500' : 'text-green-500';

    return (
        <div id="printable-compliance-report" className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 mt-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-white flex items-center"><Gavel className="w-8 h-8 mr-3 text-purple-400"/> Bid Compliance & Analysis Report</h2>
                    <p className="text-slate-400 text-sm mt-1">RFP: <span className="text-white font-bold">{report.jobRole || "N/A"}</span> | Bidder: <span className="text-white font-bold">{report.candidateName || "Unknown"}</span></p>
                </div>
                <button 
                    onClick={() => window.print()} 
                    className="text-sm text-slate-400 hover:text-white bg-slate-700 px-3 py-2 rounded-lg flex items-center no-print"
                >
                    <Printer className="w-4 h-4 mr-2"/> Print / PDF
                </button>
            </div>

            {report.executiveSummary && (
                <div className="mb-8 p-6 bg-gradient-to-r from-purple-900/40 to-slate-800 rounded-xl border border-purple-500/30">
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="text-xl font-bold text-purple-200 flex items-center"><FileText className="w-5 h-5 mr-2 text-purple-400"/> AI Executive Summary</h3>
                        <button 
                            onClick={() => navigator.clipboard.writeText(report.executiveSummary)}
                            className="text-xs flex items-center bg-purple-700 hover:bg-purple-600 text-white px-3 py-1 rounded transition no-print"
                        >
                            <Copy className="w-3 h-3 mr-1"/> Copy Text
                        </button>
                    </div>
                    <p className="text-slate-300 italic leading-relaxed border-l-4 border-purple-500 pl-4 whitespace-pre-line">"{report.executiveSummary}"</p>
                </div>
            )}

            <div className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 bg-slate-700/50 rounded-xl border border-blue-600/50 text-center">
                    <p className="text-sm font-semibold text-white mb-1"><BarChart2 className="w-4 h-4 inline mr-2"/> Compliance Score</p>
                    <div className="text-5xl font-extrabold text-blue-400">{report.suitabilityScore}%</div>
                    <div className="text-xs text-slate-400 mt-2">Adherence to RFP Requirements</div>
                </div>
                
                <div className="p-5 bg-slate-700/50 rounded-xl border border-amber-600/50 text-center relative overflow-hidden">
                    <p className="text-sm font-semibold text-white mb-1"><Activity className="w-4 h-4 inline mr-2 text-amber-400"/> Compliance Level</p>
                    <div className={`text-4xl font-extrabold ${fitColor} mt-2`}>{report.fitLevel}</div>
                    <div className="mt-3">
                        {report.skillGaps?.length > 0 ? (
                             <span className="px-3 py-1 rounded-full bg-red-900/50 border border-red-500 text-xs text-red-300 font-bold uppercase">
                                {report.skillGaps.length} Deviations Found
                            </span>
                        ) : (
                            <span className="px-3 py-1 rounded-full bg-green-900/50 border border-green-500 text-xs text-green-300 font-bold uppercase">
                                Fully Compliant
                            </span>
                        )}
                    </div>
                </div>

                 <div className="p-5 bg-slate-700/50 rounded-xl border border-purple-600/50 text-center">
                    <p className="text-sm font-semibold text-white mb-1"><DollarSign className="w-4 h-4 inline mr-2 text-purple-400"/> Pricing/Budget</p>
                    <div className="text-3xl font-extrabold text-white mt-4 truncate" title={report.salaryIndication}>{report.salaryIndication !== "Not Specified" ? report.salaryIndication : "N/A"}</div>
                    <div className="text-xs text-slate-400 mt-1">Proposed Value</div>
                </div>
            </div>

            <div className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-700">
                    <h4 className="text-lg font-bold text-white mb-3"><Building className="w-5 h-5 inline mr-2 text-blue-400"/> Bidder Profile Highlights</h4>
                    <ul className="space-y-3">
                         <li className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-400 text-sm">Core Specialization</span>
                            <span className="text-white text-sm font-bold text-right">{report.candidateSummary?.currentRole || "N/A"}</span>
                        </li>
                        <li className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-400 text-sm">Location</span>
                            <span className="text-white text-sm font-bold text-right">{report.candidateLocation || "Unknown"}</span>
                        </li>
                         <li className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-400 text-sm">Relevant Experience</span>
                            <span className="text-white text-sm font-bold text-right">{report.candidateSummary?.yearsExperienceNum > 0 ? `${report.candidateSummary.yearsExperienceNum} Yrs Ref.` : "N/A"}</span>
                        </li>
                        <li className="flex justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-400 text-sm">Key Certs/Standards</span>
                            <span className="text-white text-sm font-bold text-right">{report.candidateSummary?.educationLevel || "N/A"}</span>
                        </li>
                    </ul>
                </div>
                
                <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-700">
                    <h4 className="text-lg font-bold text-white mb-3"><AlertTriangle className="w-5 h-5 inline mr-2 text-red-400"/> Critical Deviations / Missing Items</h4>
                    {report.skillGaps?.length > 0 ? (
                        <ul className="space-y-2">
                            {report.skillGaps.map((item, i) => (
                                 <li key={i} className="flex items-center p-2 bg-red-900/20 border border-red-900/50 rounded">
                                    <XCircle className="w-4 h-4 mr-2 text-red-500 min-w-[16px]"/>
                                    <span className="text-sm text-red-200">{item}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-green-400 text-sm italic flex items-center"><CheckCircle className="w-4 h-4 mr-2"/> No critical deviations found.</p>
                    )}
                </div>
            </div>

            {report.interviewQuestions?.length > 0 && (
                <div className="mb-10 p-6 bg-slate-900 rounded-xl border border-slate-700 border-l-4 border-l-purple-500">
                    <h4 className="text-xl font-bold text-white mb-4 flex items-center"><HelpCircle className="w-6 h-6 mr-2 text-purple-400"/> Suggested Clarification Questions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {report.interviewQuestions.map((q, i) => (
                            <div key={i} className="p-4 bg-slate-800 rounded-lg border border-slate-700 hover:border-purple-500/50 transition">
                                <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1">{q.topic}</p>
                                <p className="text-slate-200 text-sm font-medium">"{q.question}"</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <h3 className="text-2xl font-bold text-white mb-6 border-b border-slate-700 pb-3">Detailed RFP Compliance Matrix</h3>
            <div className="space-y-6">
                {findings.map((item, index) => (
                    <div key={index} className="p-5 border border-slate-700 rounded-xl shadow-md space-y-3 bg-slate-800 hover:bg-slate-700/50 transition">
                        <div className="flex justify-between items-start">
                            {/* Mapping SmartHire categories to Bid concepts conceptually for display */}
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                {item.category === "MUST_HAVE_SKILL" ? "MANDATORY REQUIREMENT" :
                                 item.category === "EXPERIENCE" ? "PAST PERFORMANCE" :
                                 item.category === "EDUCATION" ? "CERTIFICATIONS/STANDARDS" :
                                 item.category === "SOFT_SKILLS" ? "METHODOLOGY/APPROACH" :
                                 item.category}
                            </span>
                            <div className={`px-4 py-1 text-sm font-semibold rounded-full border ${item.flag === 'MATCH' ? 'bg-green-700/30 text-green-300 border-green-500' : item.flag === 'PARTIAL' ? 'bg-amber-700/30 text-amber-300 border-amber-500' : 'bg-red-700/30 text-red-300 border-red-500'}`}>
                                {item.flag === 'MATCH' ? 'COMPLIANT' : item.flag === 'PARTIAL' ? 'PARTIAL / ALT' : 'NON-COMPLIANT'}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <p className="font-semibold text-slate-400 text-xs mb-1">RFP Requirement:</p>
                                <p className="text-slate-200 text-sm">{item.requirementFromJD}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-slate-400 text-xs mb-1">Proposal Evidence:</p>
                                <p className="text-slate-300 text-sm italic">{item.candidateEvidence || "Not addressed in proposal"}</p>
                            </div>
                        </div>
                        
                        {item.recruiterAction && (
                            <div className="mt-2 pt-3 border-t border-slate-700/50">
                                <p className="text-xs text-blue-300"><span className="font-bold">Evaluator Note:</span> {item.recruiterAction}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const ComplianceRanking = ({ reportsHistory, loadReportFromHistory, deleteReport, currentUser }) => { 
    if (reportsHistory.length === 0) return null;
    const groupedReports = reportsHistory.reduce((acc, report) => {
        const jobRole = report.jobRole || "Untitled RFP";
        const percentage = report.suitabilityScore || 0;
        if (!acc[jobRole]) acc[jobRole] = { allReports: [], count: 0 };
        acc[jobRole].allReports.push({ ...report, percentage });
        acc[jobRole].count += 1;
        return acc;
    }, {});
    const rankedProjects = Object.entries(groupedReports).filter(([_, data]) => data.allReports.length >= 1).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
    
    return (
        <div className="mt-8">
            <h2 className="text-xl font-bold text-white flex items-center mb-4 border-b border-slate-700 pb-2"><Layers className="w-5 h-5 mr-2 text-purple-400"/> Bid Compliance Ranking</h2>
            <div className="space-y-6">
                {rankedProjects.map(([jobRole, data]) => (
                    <div key={jobRole} className="p-5 bg-slate-700/50 rounded-xl border border-slate-600 shadow-lg">
                        <h3 className="text-lg font-extrabold text-purple-400 mb-4 border-b border-slate-600 pb-2">{jobRole} <span className="text-sm font-normal text-slate-400">({data.count} Bids Analyzed)</span></h3>
                        <div className="space-y-3">
                            {data.allReports.sort((a, b) => b.percentage - a.percentage).map((report, idx) => (
                                <div key={report.id} className="p-3 rounded-lg border border-slate-600 bg-slate-900/50 space-y-2 flex justify-between items-center hover:bg-slate-700/50">
                                    <div className='flex items-center cursor-pointer' onClick={() => loadReportFromHistory(report)}>
                                        <div className={`text-xl font-extrabold w-8 ${idx === 0 ? 'text-green-400' : 'text-slate-500'}`}>#{idx + 1}</div>
                                        <div className='ml-3'>
                                            <p className="text-sm font-medium text-white">{report.candidateName || "Unknown Bidder"}</p>
                                            <p className="text-xs text-slate-400">{new Date(report.timestamp).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center">
                                        {currentUser && currentUser.role === 'ADMIN' && <button onClick={(e) => {e.stopPropagation(); deleteReport(report.id, report.jobRole, report.candidateName, report.ownerId || currentUser.uid);}} className="mr-2 p-1 bg-red-600 rounded"><Trash2 className="w-4 h-4 text-white"/></button>}
                                        <span className={`px-2 py-0.5 rounded text-sm font-bold ${report.percentage > 80 ? 'bg-green-600 text-white' : report.percentage > 50 ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'}`}>{report.percentage}% Compliant</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ReportHistory = ({ reportsHistory, loadReportFromHistory, isAuthReady, userId, setCurrentPage, currentUser, deleteReport, handleLogout }) => { 
    if (!isAuthReady || !userId) return <div className="text-center text-red-400">Please login to view history.</div>;
    return (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-3">
                <h2 className="text-xl font-bold text-white flex items-center"><Clock className="w-5 h-5 mr-2 text-purple-500"/> Saved Bid Analyses ({reportsHistory.length})</h2>
                <div className="flex gap-2">
                    <button onClick={() => setCurrentPage(PAGE.COMPLIANCE_CHECK)} className="text-sm text-slate-400 hover:text-purple-500 flex items-center"><ArrowLeft className="w-4 h-4 mr-1"/> Back</button>
                    <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-red-400 flex items-center ml-4">Logout</button>
                </div>
            </div>
            <ComplianceRanking reportsHistory={reportsHistory} loadReportFromHistory={loadReportFromHistory} deleteReport={deleteReport} currentUser={currentUser} />
        </div>
    );
};

// --- AUTH COMPONENT ---
const AuthPage = ({ setCurrentPage, setErrorMessage, errorMessage, db, auth, isRegisteringRef }) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [regForm, setRegForm] = useState({ name: '', company: '', email: '', phone: '', password: '' });
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [resetEmail, setResetEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showResetInput, setShowResetInput] = useState(false);

    const handleRegChange = (e) => setRegForm({ ...regForm, [e.target.name]: e.target.value });
    const handleLoginChange = (e) => setLoginForm({ ...loginForm, [e.target.name]: e.target.value });

    const handleRegister = async (e) => {
        e.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);
        isRegisteringRef.current = true;

        try {
            const userCred = await createUserWithEmailAndPassword(auth, regForm.email, regForm.password);
            await sendEmailVerification(userCred.user);
            await setDoc(doc(db, 'users', userCred.user.uid), {
                name: regForm.name,
                company: regForm.company,
                email: regForm.email,
                phone: regForm.phone,
                role: 'BIDDER', // Default role for SmartBids users
                registeredVia: 'SMARTBIDS', 
                createdAt: Date.now()
            });
            // Optional: Send welcome email via a trigger extension or similar if configured
            await signOut(auth);
            setLoginForm({ email: regForm.email, password: '' });
            setIsLoginView(true);
            setErrorMessage('SUCCESS: Registration successful! Please verify your email before logging in.'); 
        } catch (err) {
            console.error('Registration error', err);
            setErrorMessage(err.message || 'Registration failed. Please try again.');
        } finally {
            setIsSubmitting(false);
            isRegisteringRef.current = false;
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);
        try {
            await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
            // Auth state listener in App component will handle redirection based on role
        } catch (err) {
            console.error('Login error', err);
            let msg = 'Login failed. Check credentials.';
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') msg = 'Invalid email or password.';
            if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Try again later.';
            setErrorMessage(msg);
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        if (!resetEmail) { setErrorMessage("Please enter your email for reset."); return; }
        setIsSubmitting(true); setErrorMessage(null);
        try {
            await sendPasswordResetEmail(auth, resetEmail);
            setErrorMessage("SUCCESS: Password reset link sent to your email.");
            setShowResetInput(false); setResetEmail('');
        } catch (e) { setErrorMessage("Reset failed: " + e.message); }
        finally { setIsSubmitting(false); }
    };

    const isSuccess = errorMessage && errorMessage.includes('SUCCESS');

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900">
            <div className="relative w-full max-w-4xl p-8 bg-slate-800/50 rounded-3xl shadow-2xl border border-slate-700 backdrop-blur-sm overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-pulse"></div>
                 
                 <div className="text-center mb-10">
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-300 mb-3 flex items-center justify-center">
                        <Gavel className="w-10 h-10 mr-3 text-purple-400" /> SmartBids
                    </h1>
                    <p className="text-lg text-slate-300 max-w-lg mx-auto">AI-Powered Bid Analysis & Compliance Engine. Optimize Proposals, Win More Business.</p>
                 </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    {/* REGISTRATION FORM */}
                    <div className={`p-6 rounded-2xl border border-blue-500/30 bg-slate-700/30 transition-all duration-500 ${!isLoginView ? 'opacity-100 scale-100' : 'opacity-50 scale-95 blur-[1px]'}`}>
                        <h3 className="text-xl font-bold text-blue-300 flex items-center mb-6"><UserPlus className="w-5 h-5 mr-2" /> Create Bidder Account</h3>
                        <form onSubmit={handleRegister} className="space-y-3">
                            <FormInput id="reg-name" label="Full Name *" name="name" value={regForm.name} onChange={handleRegChange} type="text" required={true} />
                            <FormInput id="reg-company" label="Company Name" name="company" value={regForm.company} onChange={handleRegChange} type="text" />
                            <FormInput id="reg-email" label="Email Address *" name="email" value={regForm.email} onChange={handleRegChange} type="email" required={true} />
                            <FormInput id="reg-phone" label="Phone Number" name="phone" value={regForm.phone} onChange={handleRegChange} type="tel" />
                            <FormInput id="reg-password" label="Create Password *" name="password" value={regForm.password} onChange={handleRegChange} type="password" required={true} placeholder="Min. 6 characters" />
                            <button type="submit" disabled={isSubmitting || isLoginView} className={`w-full py-3 text-lg font-semibold rounded-xl text-white transition-all shadow-lg mt-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center`}>
                                {isSubmitting && !isLoginView ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <UserPlus className="h-5 w-5 mr-2" />} {isSubmitting && !isLoginView ? 'Registering...' : 'Register'}
                            </button>
                            
                            {/* ADDED TERMS & PRIVACY LINKS HERE */}
                            <div className="mt-4 text-[10px] text-slate-500 text-center leading-tight">
                                By registering, you agree to our{' '}
                                <a
                                    href="https://img1.wsimg.com/blobby/go/203a0c5d-2209-4c66-b0c4-991df2124bd3/downloads/0c0d3149-68a2-42ef-abeb-f0c82323cfef/TERMS%20OF%20SERVICE.pdf?ver=1764379110939"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline"
                                >
                                    Terms of Service
                                </a>{' '}
                                &{' '}
                                <a
                                    href="https://img1.wsimg.com/blobby/go/203a0c5d-2209-4c66-b0c4-991df2124bd3/downloads/1a00cf64-6cab-4f3d-89c1-f370755ca03c/PRIVACY%20POLICY.pdf?ver=1764379110939"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline"
                                >
                                    Privacy Policy
                                </a>.
                            </div>
                            
                            <div className="mt-4 text-center">
                                <span className="text-slate-400 text-sm">Already have an account? </span>
                                <button onClick={() => setIsLoginView(true)} className="text-blue-400 hover:text-blue-300 font-semibold text-sm transition-colors">Sign In</button>
                            </div>
                        </form>
                    </div>

                    {/* LOGIN FORM */}
                    <div className={`p-6 rounded-2xl border border-purple-500/30 bg-slate-700/30 transition-all duration-500 ${isLoginView ? 'opacity-100 scale-100' : 'opacity-50 scale-95 blur-[1px]'}`}>
                        <h3 className="text-xl font-bold text-purple-300 flex items-center mb-6"><LogIn className="w-5 h-5 mr-2" /> Sign In</h3>
                         {!showResetInput ? (
                            <form onSubmit={handleLogin} className="space-y-4">
                                <FormInput id="login-email" label="Email *" name="email" value={loginForm.email} onChange={handleLoginChange} type="email" required={true} />
                                <FormInput id="login-password" label="Password *" name="password" value={loginForm.password} onChange={handleLoginChange} type="password" required={true} />
                                <button type="submit" disabled={isSubmitting || !isLoginView} className={`w-full py-3 text-lg font-semibold rounded-xl text-white transition-all shadow-lg mt-6 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 flex items-center justify-center`}>
                                    {isSubmitting && isLoginView ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <LogIn className="h-5 w-5 mr-2" />} {isSubmitting && isLoginView ? 'Signing In...' : 'Sign In'}
                                </button>
                                 <div className="mt-4 text-center flex flex-col space-y-2">
                                    <button type="button" onClick={() => setShowResetInput(true)} className="text-sm text-slate-400 hover:text-purple-300 transition-colors">Forgot password?</button>
                                    <div>
                                        <span className="text-slate-400 text-sm">New to SmartBids? </span>
                                        <button onClick={() => setIsLoginView(false)} className="text-purple-400 hover:text-purple-300 font-semibold text-sm transition-colors">Create an account</button>
                                    </div>
                                </div>
                            </form>
                         ) : (
                             <form onSubmit={handlePasswordReset} className="space-y-4">
                                <FormInput id="reset-email" label="Enter Email for Reset" name="resetEmail" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} type="email" required={true} />
                                <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-slate-600 hover:bg-slate-500 text-white rounded-xl flex items-center justify-center">
                                     {isSubmitting ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Send className="h-5 w-5 mr-2" />} Send Reset Link
                                </button>
                                <button type="button" onClick={() => setShowResetInput(false)} className="w-full text-sm text-slate-400 hover:text-white mt-2">Cancel</button>
                            </form>
                         )}
                    </div>
                </div>

                 {errorMessage && (
                    <div className={`mt-8 p-4 mx-auto max-w-lg rounded-xl border backdrop-blur-md flex items-center relative z-20 ${isSuccess ? 'bg-green-900/30 border-green-500/50 text-green-200' : 'bg-red-900/30 border-red-500/50 text-red-200'}`}>
                        {isSuccess ? <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0"/> : <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0"/>}
                        <p className="text-sm font-medium">{errorMessage}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- ADMIN DASHBOARD COMPONENT (Simplified for SmartBids Context) ---
const AdminDashboard = ({ setCurrentPage, currentUser, reportsHistory, handleLogout, db }) => {
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Fetch all users for the registry list (Admin View)
  useEffect(() => {
      const fetchUsers = async () => {
          setIsLoadingUsers(true);
          try {
              const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
              const querySnapshot = await getDocs(q);
              const usersData = [];
              querySnapshot.forEach((doc) => {
                  // Filter out admins, show prospects
                  if (doc.data().role !== 'ADMIN') {
                       usersData.push({ id: doc.id, ...doc.data() });
                  }
              });
              setAllUsers(usersData);
          } catch (error) {
              console.error("Error fetching users registry:", error);
          } finally {
              setIsLoadingUsers(false);
          }
      };
      if (db) { fetchUsers(); }
      // Simulate admin loading finish
      setTimeout(() => setIsLoadingAdmin(false), 500);
  }, [db]);


  if (isLoadingAdmin || isLoadingUsers) {
      return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin w-12 h-12 text-purple-400"/></div>;
  }

  return (
    <div id="admin-print-area" className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 space-y-8">
      <div className="flex justify-between items-center border-b border-slate-700 pb-4">
        <div>
             <h2 className="text-3xl font-bold text-white flex items-center"><Shield className="w-8 h-8 mr-3 text-red-500" /> SmartBids Admin Console</h2>
             <p className="text-slate-400 text-sm mt-1">User Registry & Platform Overview</p>
        </div>
        <div className="flex space-x-3 no-print">
            <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-red-400 flex items-center border border-slate-600 px-3 py-2 rounded-lg"><ArrowLeft className="w-4 h-4 mr-1" /> Logout</button>
        </div>
      </div>
      
      {/* USER REGISTRY LIST */}
      <div className="pt-2">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center"><Users className="w-6 h-6 mr-2 text-purple-400" /> Registered Bidder Registry</h3>
        
        <div className="overflow-x-auto rounded-xl border border-slate-700 max-h-[600px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs uppercase bg-slate-900/50 text-slate-400 sticky top-0 z-10">
                    <tr>
                        <th className="px-6 py-4 rounded-tl-xl">Registered</th>
                        <th className="px-6 py-4">Full Name</th>
                        <th className="px-6 py-4">Company</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Source App</th>
                        <th className="px-6 py-4 rounded-tr-xl">Phone</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700 bg-slate-800/50">
                    {allUsers.map(user => (
                        <tr key={user.id} className="hover:bg-slate-700/30 transition">
                            <td className="px-6 py-4 whitespace-nowrap">{new Date(user.createdAt).toLocaleDateString()}</td>
                            <td className="px-6 py-4 font-bold text-white">{user.name}</td>
                            <td className="px-6 py-4">{user.company || "N/A"}</td>
                            <td className="px-6 py-4 text-purple-300">{user.email}</td>
                            <td className="px-6 py-4 font-medium">{user.registeredVia || "Legacy"}</td>
                            <td className="px-6 py-4">{user.phone || "N/A"}</td>
                        </tr>
                    ))}
                     {allUsers.length === 0 && <tr><td colSpan="6" className="px-6 py-8 text-center text-slate-500 italic">No users registered yet.</td></tr>}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};


const AuditPage = ({ title, handleAnalyze, usageLimits, setCurrentPage, currentUser, loading, RFQFile, BidFile, setRFQFile, setBidFile, errorMessage, report, saveReport, saving, setErrorMessage, userId, handleLogout }) => {
    return (
        <>
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-3">
                    <h2 className="text-2xl font-bold text-white flex items-center"><Gavel className="w-6 h-6 mr-2 text-purple-400"/> {title}</h2>
                    <div className="text-right">
                        {currentUser?.role === 'ADMIN' ? (
                            <p className="text-xs text-red-400 font-bold flex items-center justify-end"><Shield className="w-3 h-3 mr-1"/> Admin Mode</p>
                        ) : (
                            // Simple status display for now, paywall logic hidden as per limits
                            <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500 text-purple-400 text-xs font-bold inline-flex items-center">
                                <Award className="w-3 h-3 mr-1" /> Standard Access
                            </div>
                        )}
                        <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-purple-500 block ml-auto mt-1">Logout</button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FileUploader title="RFP / Tender Document" file={RFQFile} setFile={(e) => handleFileChange(e, setRFQFile, setErrorMessage)} color="blue" requiredText="Upload the requirements (PDF/DOCX/TXT)" icon={FileText} />
                    <FileUploader title="Your Proposal / Bid" file={BidFile} setFile={(e) => handleFileChange(e, setBidFile, setErrorMessage)} color="purple" requiredText="Upload your response draft" icon={Description} />
                </div>
                
                {errorMessage && <div className="mt-6 p-4 bg-red-900/40 text-red-300 border border-red-700 rounded-xl flex items-center"><AlertTriangle className="w-5 h-5 mr-3"/>{errorMessage}</div>}
                
                <button onClick={() => handleAnalyze('BIDDER')} disabled={loading || !RFQFile || !BidFile} className="mt-8 w-full flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 transition-all shadow-lg">
                    {loading ? <Loader2 className="animate-spin h-6 w-6 mr-3" /> : <Zap className="h-6 w-6 mr-3" />} {loading ? 'ANALYZING COMPLIANCE...' : 'RUN COMPLIANCE CHECK'}
                </button>
                
                {report && userId && <button onClick={() => saveReport('BIDDER')} disabled={saving} className="mt-4 w-full flex items-center justify-center px-8 py-3 text-md font-semibold rounded-xl text-white bg-slate-700 hover:bg-slate-600 disabled:opacity-50 border border-slate-600"><Save className="h-5 w-5 mr-2" /> {saving ? 'SAVING ANALYSIS...' : 'SAVE REPORT TO HISTORY'}</button>}
                {(report || userId) && <button onClick={() => setCurrentPage(PAGE.HISTORY)} className="mt-2 w-full flex items-center justify-center px-8 py-3 text-md font-semibold rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/50"><List className="h-5 w-5 mr-2" /> VIEW ANALYSIS HISTORY</button>}
            </div>
            {report && <ComplianceReport report={report} />}
        </>
    );
};

// --- APP COMPONENT ---
const App = () => {
    const [currentPage, setCurrentPage] = useState(PAGE.HOME);
    const [errorMessage, setErrorMessage] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [userId, setUserId] = useState(null);
    // Usage limits tracked but currently high cap
    const [usageLimits, setUsageLimits] = useState({ bidderChecks: 0 });
    const [reportsHistory, setReportsHistory] = useState([]);
    const [showPaywall, setShowPaywall] = useState(false);
    
    const isRegisteringRef = useRef(false); 

    const [RFQFile, setRFQFile] = useState(null);
    const [BidFile, setBidFile] = useState(null);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleLogout = async () => {
        await signOut(auth);
        setUserId(null); setCurrentUser(null); setReportsHistory([]); setReport(null); setRFQFile(null); setBidFile(null);
        setUsageLimits({ bidderChecks: 0 });
        setCurrentPage(PAGE.HOME); setErrorMessage(null);
    };

    // Auth State Listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    // Default to BIDDER role if doc doesn't exist yet
                    const userData = userDoc.exists() ? userDoc.data() : { role: 'BIDDER' };
                    setCurrentUser({ uid: user.uid, ...userData });
                    
                    // Redirect logic after login/reg
                    if (!isRegisteringRef.current) {
                        if (userData.role === 'ADMIN') setCurrentPage(PAGE.ADMIN);
                        else setCurrentPage(PAGE.COMPLIANCE_CHECK);
                    }
                } catch (error) { 
                    console.error("Auth Data Fetch Error", error);
                    setCurrentUser({ uid: user.uid, role: 'BIDDER' }); 
                    if (!isRegisteringRef.current) setCurrentPage(PAGE.COMPLIANCE_CHECK); 
                }
            } else {
                // Reset state on logout
                setUserId(null); setCurrentUser(null); setReportsHistory([]); setReport(null); setCurrentPage(PAGE.HOME);
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // Usage Tracker Listener
    useEffect(() => {
        if (db && userId) {
            const docRef = getUsageDocRef(db, userId);
            const unsubscribe = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    setUsageLimits({ bidderChecks: docSnap.data().bidderChecks || 0 });
                } else {
                    // Initialize tracker if missing
                    setDoc(docRef, { bidderChecks: 0 }).catch(e => console.error("Tracker Init Failed", e));
                }
            });
            return () => unsubscribe();
        }
    }, [userId]);

    // History Fetcher (Admin sees all, User sees own)
    useEffect(() => {
        if (!db || !currentUser) return;
        let unsubscribeSnapshot = null;
        let q;
        
        if (currentUser.role === 'ADMIN') { 
            // Admin view: fetch all reports in collection group
            q = query(collectionGroup(db, 'candidate_reports'), orderBy('timestamp', 'desc'), limit(100)); 
        } else if (userId) { 
            // User view: fetch reports from own subcollection
            q = query(getReportsCollectionRef(db, userId), orderBy('timestamp', 'desc')); 
        }
        
        if (q) {
            unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
                const history = [];
                snapshot.forEach(docSnap => {
                    // Determine ownerId based on query type
                    let ownerId = userId;
                    if (currentUser.role === 'ADMIN' && docSnap.ref.parent.parent) {
                         ownerId = docSnap.ref.parent.parent.id;
                    }
                    history.push({ id: docSnap.id, ownerId: ownerId, ...docSnap.data() });
                });
                setReportsHistory(history);
            }, (error) => console.error("History Fetch Error:", error));
        }
        return () => unsubscribeSnapshot && unsubscribeSnapshot();
    }, [userId, currentUser, db]);

    // Load external libraries needed for file parsing
    useEffect(() => {
        const loadScript = (src) => new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
            const script = document.createElement('script');
            script.src = src; script.onload = resolve; script.onerror = reject;
            document.head.appendChild(script);
        });

        const loadLibs = async () => {
            try {
                await Promise.all([
                    loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"),
                    loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth.js/1.4.15/mammoth.browser.min.js")
                ]);
                if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
            } catch (e) { console.warn("Lib loading failed:", e); }
        };
        loadLibs();
    }, []); 

    const incrementUsage = async () => {
        if (!db || !userId) return;
        const docRef = getUsageDocRef(db, userId);
        try {
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                const newCount = (docSnap.exists() ? docSnap.data().bidderChecks || 0 : 0) + 1;
                transaction.set(docRef, { bidderChecks: newCount }, { merge: true });
            });
        } catch (e) { console.error("Usage update failed:", e); }
    };

    const handleAnalyze = useCallback(async (role) => {
        // Check usage limits (currently high cap)
        if (currentUser?.role !== 'ADMIN' && usageLimits.bidderChecks >= MAX_FREE_AUDITS) {
            setShowPaywall(true); return;
        }
        if (!RFQFile || !BidFile) { setErrorMessage("Please upload both RFP and Bid documents."); return; }
        
        setLoading(true); setReport(null); setErrorMessage(null);

        try {
            // Extract text from files
            const rfpContent = await processFile(RFQFile);
            const bidContent = await processFile(BidFile);
            
            // AI System Prompt adapted for Bid Compliance
            const systemPrompt = {
                parts: [{
                    text: `You are SmartBids AI, an expert Proposal Evaluator & Compliance Officer.
                    Your task is to analyze a Bid Proposal against an RFP/Tender Document.
                    
                    Objectives:
                    1. EXTRACT Metadata: RFP Title/Subject (jobRole), Bidder Name (candidateName).
                    2. EXTRACT Specifics: Bidder location if present, Total Proposed Price/Budget indication.
                    3. ASSESS: Identify relevant experience years and key certifications mentioned.
                    4. CALCULATE: An overall 0-100 Compliance Score based on requirements met.
                    5. IDENTIFY DEVIATIONS: List critical non-compliance issues or missing mandatory items (Skill Gaps).
                    6. FORMULATE STRATEGY: Generate 3 clarifying questions for the bidder.
                    7. DETAILED MATCHING: Create a line-by-line comparison matrix of RFP requirements vs. Proposal evidence, flagging compliance status.
                    
                    Output MUST be strictly JSON matching the provided schema.`
                }]
            };

            const userQuery = `
                <RFP_Document>
                ${rfpContent}
                </RFP_Document>

                <Bid_Proposal>
                ${bidContent}
                </Bid_Proposal>
                
                Perform Bid Compliance Analysis.
            `;

            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: systemPrompt,
                generationConfig: { 
                    responseMimeType: "application/json", 
                    responseSchema: SMARTHIRE_REPORT_SCHEMA // Using existing schema structure
                }
            };

            // Call AI Proxy Endpoint
            const response = await fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (jsonText) {
                const parsedReport = JSON.parse(jsonText);
                // Ensure essential fields have fallbacks
                parsedReport.jobRole = parsedReport.jobRole || "Untitled RFP";
                parsedReport.candidateName = parsedReport.candidateName || "Unknown Bidder";
                setReport(parsedReport);
                await incrementUsage();
            } else { throw new Error("AI response was empty or invalid."); }

        } catch (error) {
            console.error("Analysis Error:", error);
            setErrorMessage(`Analysis failed: ${error.message || "Please check your documents and try again."}`);
        } finally { setLoading(false); }
    }, [RFQFile, BidFile, usageLimits, currentUser]);

    const saveReport = useCallback(async (role) => {
        if (!db || !userId || !report) { setErrorMessage("Cannot save: Missing data."); return; }
        setSaving(true);
        try {
            // Save report to user's subcollection
            await addDoc(getReportsCollectionRef(db, userId), {
                ...report,
                timestamp: Date.now(),
                role: role, 
                ownerId: userId 
            });
            setErrorMessage("SUCCESS: Report saved to history."); 
            setTimeout(() => setErrorMessage(null), 3000);
        } catch (error) {
            console.error("Save Error:", error);
            setErrorMessage(`Failed to save report: ${error.message}`);
        } finally { setSaving(false); }
    }, [db, userId, report]);
    
    const deleteReport = useCallback(async (reportId) => {
        if (!db || !userId) return;
        if (!confirm("Are you sure you want to delete this report?")) return;
        try {
            // Delete report from user's subcollection
            await deleteDoc(doc(getReportsCollectionRef(db, userId), reportId));
            if (report && report.id === reportId) setReport(null);
            setErrorMessage("Report deleted.");
            setTimeout(() => setErrorMessage(null), 2000);
        } catch (error) { 
             console.error("Delete Error:", error);
             setErrorMessage("Could not delete report."); 
        }
    }, [db, userId, report]);

    const loadReportFromHistory = useCallback((historyItem) => {
        setRFQFile(null); setBidFile(null); // Clear current file inputs
        setReport(historyItem); // Load selected report data
        setCurrentPage(PAGE.COMPLIANCE_CHECK); 
    }, []);
    
    // Page Router
    const renderPage = () => {
        if (!isAuthReady) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin w-12 h-12 text-purple-400"/></div>;
        
        switch (currentPage) {
            case PAGE.HOME:
                return <AuthPage 
                            setCurrentPage={setCurrentPage} 
                            setErrorMessage={setErrorMessage} 
                            errorMessage={errorMessage} 
                            db={db} 
                            auth={auth} 
                            isRegisteringRef={isRegisteringRef} 
                        />;
            case PAGE.COMPLIANCE_CHECK:
                return <AuditPage 
                    title="Bid Compliance Check & Optimization" 
                    handleAnalyze={handleAnalyze} usageLimits={usageLimits} setCurrentPage={setCurrentPage}
                    currentUser={currentUser} loading={loading} RFQFile={RFQFile} BidFile={BidFile}
                    setRFQFile={setRFQFile} setBidFile={setBidFile} 
                    errorMessage={errorMessage} report={report} saveReport={saveReport} saving={saving}
                    setErrorMessage={setErrorMessage} userId={userId} handleLogout={handleLogout}
                />;
            case PAGE.ADMIN:
                return <AdminDashboard setCurrentPage={setCurrentPage} currentUser={currentUser} reportsHistory={reportsHistory} loadReportFromHistory={loadReportFromHistory} handleLogout={handleLogout} db={db} />;
            case PAGE.HISTORY:
                return <ReportHistory reportsHistory={reportsHistory} loadReportFromHistory={loadReportFromHistory} deleteReport={deleteReport} isAuthReady={isAuthReady} userId={userId} setCurrentPage={setCurrentPage} currentUser={currentUser} handleLogout={handleLogout} />;
            default: return <AuthPage setCurrentPage={setCurrentPage} setErrorMessage={setErrorMessage} errorMessage={errorMessage} db={db} auth={auth} />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 font-body text-slate-100">
            {/* Global Styles & Fonts */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700;800&display=swap');
                .font-body, .font-body * { font-family: 'Lexend', sans-serif !important; }
                input[type="file"] { display: block; width: 100%; }
                input[type="file"]::file-selector-button { background-color: #8b5cf6; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: background-color 0.2s; }
                input[type="file"]::file-selector-button:hover { background-color: #7c3aed; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #475569; border-radius: 3px; }
                .custom-scrollbar::-webkit-scrollbar-track { background-color: rgba(0,0,0,0.1); }
                @media print { 
                    body * { visibility: hidden; } 
                    #printable-compliance-report, #printable-compliance-report * { visibility: visible; }
                    #printable-compliance-report { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; padding: 20px; }
                    .no-print { display: none !important; } 
                    /* Ensure gradients and colors print decently if user enables background graphics */
                    .bg-gradient-to-r { background: #f3e8ff !important; border-color: #d8b4fe !important; }
                    .text-transparent { color: #6b21a8 !important; -webkit-text-fill-color: #6b21a8 !important; }
                }
            `}</style>
            
            <div className="max-w-6xl mx-auto p-4 sm:p-8">
                {renderPage()}
            </div>
            
            <PaywallModal show={showPaywall} onClose={() => setShowPaywall(false)} />
        </div>
    );
};

const MainApp = App;

// Top level wrapper for error handling boundary
function TopLevelApp() {
    return (
        <ErrorBoundary>
            <MainApp />
        </ErrorBoundary>
    );
}

export default TopLevelApp;
