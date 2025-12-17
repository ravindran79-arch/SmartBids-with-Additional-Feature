import React, { useState, useCallback, useEffect } from 'react';
import { 
    FileUp, Send, Loader2, AlertTriangle, CheckCircle, List, FileText, BarChart2,
    Save, Clock, Zap, ArrowLeft, Users, Briefcase, Layers, UserPlus, LogIn, Tag,
    Shield, User, HardDrive, Phone, Mail, Building, Trash2, Eye, DollarSign, Activity, 
    Printer, Download, MapPin, Calendar, ThumbsUp, ThumbsDown, Gavel, Paperclip, Copy, Award, Lock, CreditCard, Info,
    FileSearch, Table 
} from 'lucide-react'; 

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { 
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, signOut 
} from 'firebase/auth';
import { 
    getFirestore, collection, addDoc, onSnapshot, query, doc, setDoc, 
    runTransaction, deleteDoc, getDocs, getDoc, collectionGroup
} from 'firebase/firestore'; 

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- CONSTANTS ---
const API_URL = '/api/analyze'; 

const CATEGORY_ENUM = ["LEGAL", "FINANCIAL", "TECHNICAL", "TIMELINE", "REPORTING", "ADMINISTRATIVE", "OTHER"];
const EXTRACTION_CATEGORY_ENUM = ["SCOPE", "TECHNICAL", "COMMERCIAL", "ADMIN", "HSE", "LOGISTICS", "OTHER"]; 
const MAX_FREE_AUDITS = 3; 

const PAGE = {
    HOME: 'HOME',
    COMPLIANCE_CHECK: 'COMPLIANCE_CHECK', 
    ADMIN: 'ADMIN',                     
    HISTORY: 'HISTORY' 
};

// --- JSON SCHEMAS ---

// 1. Existing Schema for Comparison
const COMPREHENSIVE_REPORT_SCHEMA = {
    type: "OBJECT",
    description: "The complete compliance audit report with market intelligence and bid coaching data.",
    properties: {
        "projectTitle": { "type": "STRING", "description": "Official Project Title from RFQ." },
        "rfqScopeSummary": { "type": "STRING", "description": "High-level scope summary from RFQ." },
        "grandTotalValue": { "type": "STRING", "description": "Total Bid Price/Cost." },
        "industryTag": { "type": "STRING" },
        "primaryRisk": { "type": "STRING" },
        "projectLocation": { "type": "STRING" },
        "contractDuration": { "type": "STRING" },
        "techKeywords": { "type": "STRING" },
        "requiredCertifications": { "type": "STRING" },
        "buyingPersona": { "type": "STRING" },
        "complexityScore": { "type": "STRING" },
        "trapCount": { "type": "STRING" },
        "leadTemperature": { "type": "STRING" },
        "generatedExecutiveSummary": { "type": "STRING" },
        "persuasionScore": { "type": "NUMBER" },
        "toneAnalysis": { "type": "STRING" },
        "weakWords": { "type": "ARRAY", "items": { "type": "STRING" } },
        "procurementVerdict": {
            "type": "OBJECT",
            "properties": {
                "winningFactors": { "type": "ARRAY", "items": { "type": "STRING" } },
                "losingFactors": { "type": "ARRAY", "items": { "type": "STRING" } }
            }
        },
        "legalRiskAlerts": { "type": "ARRAY", "items": { "type": "STRING" } },
        "submissionChecklist": { "type": "ARRAY", "items": { "type": "STRING" } },
        "executiveSummary": { "type": "STRING" },
        "findings": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "requirementFromRFQ": { "type": "STRING" },
                    "complianceScore": { "type": "NUMBER" },
                    "bidResponseSummary": { "type": "STRING" },
                    "flag": { "type": "STRING", "enum": ["COMPLIANT", "PARTIAL", "NON-COMPLIANT"] },
                    "category": { "type": "STRING", "enum": CATEGORY_ENUM },
                    "negotiationStance": { "type": "STRING" }
                }
            }
        }
    },
    "required": ["projectTitle", "rfqScopeSummary", "findings", "executiveSummary"] 
};

// 2. NEW SCHEMA FOR RFQ EXTRACTION
const RFQ_EXTRACTION_SCHEMA = {
    type: "OBJECT",
    description: "Executive Brief and Detailed Compliance Matrix extracted from RFQ.",
    properties: {
        "projectEssence": {
            "type": "OBJECT",
            "description": "High-level Executive Brief of the SOW.",
            "properties": {
                "projectTitle": { "type": "STRING" },
                "projectLocation": { "type": "STRING" },
                "coreScope": { "type": "STRING", "description": "The 'One-Liner' describing the main job." },
                "keyDeliverables": { "type": "ARRAY", "items": { "type": "STRING" }, "description": "Major hardware/outputs (e.g. '1200MT Module')." },
                "strategicConstraints": { "type": "ARRAY", "items": { "type": "STRING" }, "description": "Local content, specific yards, software requirements." },
                "commercialRisks": { "type": "ARRAY", "items": { "type": "STRING" }, "description": "Liquidated damages, free storage, tax duties." },
                "criticalTimelines": { "type": "ARRAY", "items": { "type": "STRING" } }
            }
        },
        "complianceMatrix": {
            "type": "ARRAY",
            "description": "The Shredded List of every single requirement.",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "sectionRef": { "type": "STRING", "description": "e.g. 3.1.2" },
                    "category": { "type": "STRING", "enum": EXTRACTION_CATEGORY_ENUM },
                    "requirementVerbatim": { "type": "STRING", "description": "Exact text from SOW." },
                    "actionItem": { "type": "STRING", "description": "What the bidder must do." },
                    "strictness": { "type": "STRING", "enum": ["MANDATORY", "CRITICAL", "HIGH_COST", "HIDDEN_COST"] }
                }
            }
        }
    },
    "required": ["projectEssence", "complianceMatrix"]
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

const getUsageDocRef = (db, userId) => doc(db, `users/${userId}/usage_limits`, 'main_tracker');
const getReportsCollectionRef = (db, userId) => collection(db, `users/${userId}/compliance_reports`);

const getCompliancePercentage = (report) => {
    const findings = report.findings || []; 
    const totalScore = findings.reduce((sum, item) => sum + (item.complianceScore || 0), 0);
    const maxScore = findings.length * 1;
    return maxScore > 0 ? parseFloat(((totalScore / maxScore) * 100).toFixed(1)) : 0;
};

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
                        <h2 className="text-xl font-bold mb-2">Critical Application Error</h2>
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

const FormInput = ({ label, name, value, onChange, type, placeholder, id }) => (
    <div>
        <label htmlFor={id || name} className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <input
            id={id || name}
            name={name}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder || ''}
            required={label.includes('*')}
            className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-amber-500 focus:border-amber-500 text-sm"
        />
    </div>
);

const PaywallModal = ({ show, onClose, userId }) => {
    if (!show) return null;
    const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_cNi00i4JHdOmdTT8VJafS00"; 
    const handleUpgrade = () => {
        if (userId) window.location.href = `${STRIPE_PAYMENT_LINK}?client_reference_id=${userId}`;
        else alert("Error: User ID missing. Please log in again.");
    };
    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
            <div className="bg-slate-800 rounded-2xl shadow-2xl border border-amber-500/50 max-w-md w-full p-8 text-center relative">
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-amber-500 rounded-full p-4 shadow-lg shadow-amber-500/50">
                    <Lock className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white mt-8 mb-2">Trial Limit Reached</h2>
                <p className="text-slate-300 mb-6">You have used your <span className="text-amber-400 font-bold">3 Free Audits</span>.<br/>To continue further audits on SmartBids, upgrade to Pro.</p>
                <div className="bg-slate-700/50 rounded-xl p-4 mb-6 text-left space-y-3">
                    <div className="flex items-center text-sm text-white"><CheckCircle className="w-4 h-4 mr-3 text-green-400"/> Unlimited Compliance Audits</div>
                    <div className="flex items-center text-sm text-white"><CheckCircle className="w-4 h-4 mr-3 text-green-400"/> AI Sales Coach & Tone Analysis</div>
                    <div className="flex items-center text-sm text-white"><CheckCircle className="w-4 h-4 mr-3 text-green-400"/> Market Intelligence Data</div>
                </div>
                <button onClick={handleUpgrade} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition-all shadow-lg mb-3 flex items-center justify-center"><CreditCard className="w-5 h-5 mr-2"/> Upgrade Now - $10/mo</button>
                <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">Maybe Later (Return to Home)</button>
            </div>
        </div>
    );
};

const FileUploader = ({ title, file, setFile, color, requiredText }) => (
    <div className={`p-6 border-2 border-dashed border-${color}-600/50 rounded-2xl bg-slate-900/50 space-y-3 no-print`}>
        <h3 className={`text-lg font-bold text-${color}-400 flex items-center`}><FileUp className={`w-6 h-6 mr-2 text-${color}-500`} /> {title}</h3>
        <p className="text-sm text-slate-400">{requiredText}</p>
        <input type="file" accept=".txt,.pdf,.docx" onChange={setFile} className="w-full text-base text-slate-300"/>
        {file && <p className="text-sm font-medium text-green-400 flex items-center"><CheckCircle className="w-4 h-4 mr-1 text-green-500" /> {file.name}</p>}
    </div>
);

// --- MID-LEVEL COMPONENTS ---

// 1. Existing Report Component (For Bids)
const ComplianceReport = ({ report }) => {
    const findings = report.findings || []; 
    const overallPercentage = getCompliancePercentage(report);
    const counts = findings.reduce((acc, item) => { const flag = item.flag || 'NON-COMPLIANT'; acc[flag] = (acc[flag] || 0) + 1; return acc; }, { 'COMPLIANT': 0, 'PARTIAL': 0, 'NON-COMPLIANT': 0 });
    const getWidth = (flag) => findings.length === 0 ? '0%' : `${(counts[flag] / findings.length) * 100}%`;

    return (
        <div id="printable-compliance-report" className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 mt-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <h2 className="text-3xl font-extrabold text-white flex items-center"><List className="w-6 h-6 mr-3 text-amber-400"/> Comprehensive Compliance Report</h2>
                <button onClick={() => window.print()} className="text-sm text-slate-400 hover:text-white bg-slate-700 px-3 py-2 rounded-lg flex items-center no-print"><Printer className="w-4 h-4 mr-2"/> Print / PDF</button>
            </div>
            {/* ... Header Details ... */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">{report.projectTitle || "Project Title N/A"}</h3>
                    <p className="text-slate-400 text-sm mb-4">{report.rfqScopeSummary || "Scope N/A"}</p>
                    <div className="flex flex-wrap gap-2">
                        {report.industryTag && <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded border border-slate-600">{report.industryTag}</span>}
                        {report.buyingPersona && <span className="px-2 py-1 bg-purple-900/40 text-purple-300 text-xs rounded border border-purple-500/50">{report.buyingPersona}</span>}
                        {report.primaryRisk && <span className="px-2 py-1 bg-red-900/40 text-red-300 text-xs rounded border border-red-500/50">Risk: {report.primaryRisk}</span>}
                    </div>
                </div>
                 <div className="space-y-2 text-sm text-slate-300">
                    <p><span className="font-semibold text-slate-500">Value:</span> {report.grandTotalValue || "N/A"}</p>
                    <p><span className="font-semibold text-slate-500">Location:</span> {report.projectLocation || "N/A"}</p>
                    <p><span className="font-semibold text-slate-500">Duration:</span> {report.contractDuration || "N/A"}</p>
                    <p><span className="font-semibold text-slate-500">Complexity:</span> {report.complexityScore || "N/A"}/10</p>
                    <p><span className="font-semibold text-slate-500">Lead Temp:</span> {report.leadTemperature || "N/A"}</p>
                </div>
            </div>

            {report.generatedExecutiveSummary && (
                <div className="mb-8 p-6 bg-gradient-to-r from-blue-900/40 to-slate-800 rounded-xl border border-blue-500/30">
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="text-xl font-bold text-blue-200 flex items-center"><Award className="w-5 h-5 mr-2 text-yellow-400"/> AI-Suggested Executive Summary</h3>
                        <button onClick={() => navigator.clipboard.writeText(report.generatedExecutiveSummary)} className="text-xs flex items-center bg-blue-700 hover:bg-blue-600 text-white px-3 py-1 rounded transition no-print"><Copy className="w-3 h-3 mr-1"/> Copy Text</button>
                    </div>
                    <p className="text-slate-300 italic leading-relaxed border-l-4 border-blue-500 pl-4 whitespace-pre-line">"{report.generatedExecutiveSummary}"</p>
                </div>
            )}
             <div className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 bg-slate-700/50 rounded-xl border border-amber-600/50 text-center">
                    <p className="text-sm font-semibold text-white mb-1"><BarChart2 className="w-4 h-4 inline mr-2"/> Compliance Score</p>
                    <div className="text-5xl font-extrabold text-amber-400">{overallPercentage}%</div>
                    <div className="w-full h-3 bg-slate-900 rounded-full flex overflow-hidden mt-4"><div style={{ width: getWidth('COMPLIANT') }} className="bg-green-500"></div><div style={{ width: getWidth('PARTIAL') }} className="bg-amber-500"></div><div style={{ width: getWidth('NON-COMPLIANT') }} className="bg-red-500"></div></div>
                </div>
                
                 {/* Persuasion & Tone */}
                 <div className="p-5 bg-slate-700/50 rounded-xl border border-blue-500/30">
                    <div className="flex justify-between mb-2">
                        <span className="text-sm font-semibold text-white">Persuasion Score</span>
                        <span className="text-sm font-bold text-blue-400">{report.persuasionScore || 0}/100</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">Tone: <span className="text-white">{report.toneAnalysis || "N/A"}</span></p>
                    {report.weakWords && report.weakWords.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-red-400 mb-1">Weak Words Found:</p>
                            <div className="flex flex-wrap gap-1">{report.weakWords.map((w,i)=><span key={i} className="px-1.5 py-0.5 bg-red-900/30 text-red-300 text-[10px] rounded">{w}</span>)}</div>
                        </div>
                    )}
                 </div>
            </div>
             <h3 className="text-2xl font-bold text-white mb-6 border-b border-slate-700 pb-3">Detailed Findings</h3>
            <div className="space-y-8">
                {findings.map((item, index) => (
                    <div key={index} className="p-6 border border-slate-700 rounded-xl shadow-md space-y-3 bg-slate-800 hover:bg-slate-700/50 transition">
                        <div className="flex justify-between items-start">
                            <h3 className="text-xl font-bold text-white">#{index + 1}</h3>
                            <div className={`px-4 py-1 text-sm font-semibold rounded-full border ${item.flag === 'COMPLIANT' ? 'bg-green-700/30 text-green-300 border-green-500' : item.flag === 'PARTIAL' ? 'bg-amber-700/30 text-amber-300 border-amber-500' : 'bg-red-700/30 text-red-300 border-red-500'}`}>{item.flag} ({item.complianceScore})</div>
                        </div>
                        <p className="font-semibold text-slate-300 mt-2">RFQ Requirement Extracted:</p>
                        <p className="p-4 bg-slate-900/80 text-slate-200 rounded-lg border border-slate-700 italic text-sm">{item.requirementFromRFQ || "Text not extracted by AI"}</p>
                        <p className="font-semibold text-slate-300 mt-4">Bidder's Response Summary:</p>
                        <p className="text-slate-400 text-sm">{item.bidResponseSummary}</p>
                        {item.negotiationStance && <div className="mt-4 p-4 bg-blue-900/40 border border-blue-700 rounded-xl"><p className="font-semibold text-blue-300">Recommended Negotiation Stance:</p><p className="text-blue-200 text-sm">{item.negotiationStance}</p></div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

// 2. NEW COMPONENT: Extraction Report (For RFQ Only)
const ExtractionReport = ({ report }) => {
    const essence = report.projectEssence || {};
    const matrix = report.complianceMatrix || [];

    const exportToExcel = () => {
        const headers = ["Ref", "Category", "Strictness", "Requirement Verbatim", "Action Item"];
        const rows = matrix.map(m => [
            `"${m.sectionRef || ''}"`, 
            `"${m.category || ''}"`, 
            `"${m.strictness || ''}"`, 
            `"${(m.requirementVerbatim || '').replace(/"/g, '""')}"`, 
            `"${(m.actionItem || '').replace(/"/g, '""')}"`
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const link = document.createElement("a"); link.href = encodeURI(csvContent); link.download = `${essence.projectTitle || 'RFQ'}_Compliance_Matrix.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    return (
        <div id="printable-compliance-report" className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 mt-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <h2 className="text-3xl font-extrabold text-white flex items-center"><FileSearch className="w-8 h-8 mr-3 text-teal-400"/> RFQ Extraction & Strategy</h2>
                <div className="flex gap-2 no-print">
                    <button onClick={exportToExcel} className="text-sm text-slate-900 font-bold bg-green-400 hover:bg-green-300 px-4 py-2 rounded-lg flex items-center"><Table className="w-4 h-4 mr-2"/> Export CSV</button>
                    <button onClick={() => window.print()} className="text-sm text-slate-400 hover:text-white bg-slate-700 px-3 py-2 rounded-lg flex items-center"><Printer className="w-4 h-4 mr-2"/> Print</button>
                </div>
            </div>

            {/* --- Executive Brief Section --- */}
            <div className="mb-8 p-6 bg-slate-700/30 rounded-xl border border-teal-500/30">
                <h3 className="text-xl font-bold text-teal-300 mb-4 flex items-center"><Briefcase className="w-5 h-5 mr-2"/> Project Essence: Executive Brief</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Project Title</p>
                        <p className="text-lg text-white font-bold mb-3">{essence.projectTitle || "N/A"}</p>
                        <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Core Scope</p>
                        <p className="text-sm text-slate-300 mb-3">{essence.coreScope || "N/A"}</p>
                         <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Location</p>
                        <p className="text-sm text-slate-300 mb-3">{essence.projectLocation || "N/A"}</p>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Commercial Risks</p>
                            <ul className="text-sm text-red-300 list-disc list-inside">{essence.commercialRisks?.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Strategic Constraints</p>
                            <ul className="text-sm text-amber-300 list-disc list-inside">{essence.strategicConstraints?.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Compliance Matrix Section --- */}
            <h3 className="text-xl font-bold text-white mb-4 flex items-center"><Layers className="w-5 h-5 mr-2 text-blue-400"/> Detailed Compliance Matrix</h3>
            <div className="overflow-x-auto bg-slate-900 rounded-xl border border-slate-700">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-200 uppercase font-bold sticky top-0">
                        <tr>
                            <th className="px-4 py-3 w-20">Ref</th>
                            <th className="px-4 py-3 w-32">Category</th>
                            <th className="px-4 py-3 w-32">Strictness</th>
                            <th className="px-4 py-3">Requirement (Verbatim)</th>
                            <th className="px-4 py-3 w-64">Action Item</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {matrix.map((item, i) => (
                            <tr key={i} className="hover:bg-slate-800/50 transition">
                                <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.sectionRef}</td>
                                <td className="px-4 py-3"><span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs border border-slate-600">{item.category}</span></td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        item.strictness === 'CRITICAL' ? 'bg-red-900 text-red-200' :
                                        item.strictness === 'HIGH_COST' ? 'bg-amber-900 text-amber-200' :
                                        item.strictness === 'HIDDEN_COST' ? 'bg-purple-900 text-purple-200' :
                                        'bg-blue-900 text-blue-200'
                                    }`}>{item.strictness}</span>
                                </td>
                                <td className="px-4 py-3 text-slate-200 italic">"{item.requirementVerbatim}"</td>
                                <td className="px-4 py-3 text-green-300 font-medium">{item.actionItem}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ComplianceRanking = ({ reportsHistory, loadReportFromHistory, deleteReport, currentUser }) => { 
    if (reportsHistory.length === 0) return null;
    const groupedReports = reportsHistory.reduce((acc, report) => {
        const rfqName = report.rfqName;
        const percentage = report.reportType === 'EXTRACTION' ? 100 : getCompliancePercentage(report); 
        if (!acc[rfqName]) acc[rfqName] = { allReports: [], count: 0 };
        acc[rfqName].allReports.push({ ...report, percentage });
        acc[rfqName].count += 1;
        return acc;
    }, {});
    const rankedProjects = Object.entries(groupedReports).filter(([_, data]) => data.allReports.length >= 1).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
    return (
        <div className="mt-8">
            <h2 className="text-xl font-bold text-white flex items-center mb-4 border-b border-slate-700 pb-2"><Layers className="w-5 h-5 mr-2 text-blue-400"/> Compliance Ranking by RFQ</h2>
            <div className="space-y-6">
                {rankedProjects.map(([rfqName, data]) => (
                    <div key={rfqName} className="p-5 bg-slate-700/50 rounded-xl border border-slate-600 shadow-lg">
                        <h3 className="text-lg font-extrabold text-amber-400 mb-4 border-b border-slate-600 pb-2">{rfqName} <span className="text-sm font-normal text-slate-400">({data.count} Revisions)</span></h3>
                        <div className="space-y-3">
                            {data.allReports.sort((a, b) => b.percentage - a.percentage).map((report, idx) => (
                                <div key={report.id} className="p-3 rounded-lg border border-slate-600 bg-slate-900/50 space-y-2 flex justify-between items-center hover:bg-slate-700/50">
                                    <div className='flex items-center cursor-pointer' onClick={() => loadReportFromHistory(report)}>
                                        <div className={`text-xl font-extrabold w-8 ${idx === 0 ? 'text-green-400' : 'text-slate-500'}`}>#{idx + 1}</div>
                                        <div className='ml-3'><p className="text-sm font-medium text-white">{report.bidName || "Extraction Only"}</p><p className="text-xs text-slate-400">{new Date(report.timestamp).toLocaleDateString()}</p></div>
                                    </div>
                                    <div className="flex items-center">
                                        {currentUser && currentUser.role === 'ADMIN' && <button onClick={(e) => {e.stopPropagation(); deleteReport(report.id, report.rfqName, report.bidName, report.ownerId || currentUser.uid);}} className="mr-2 p-1 bg-red-600 rounded"><Trash2 className="w-4 h-4 text-white"/></button>}
                                        <span className="px-2 py-0.5 rounded text-sm font-bold bg-blue-600 text-slate-900">{report.reportType === 'EXTRACTION' ? 'EXT' : `${report.percentage}%`}</span>
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
                <h2 className="text-xl font-bold text-white flex items-center"><Clock className="w-5 h-5 mr-2 text-amber-500"/> Saved Report History ({reportsHistory.length})</h2>
                <div className="flex gap-2">
                    <button onClick={() => setCurrentPage(PAGE.COMPLIANCE_CHECK)} className="text-sm text-slate-400 hover:text-amber-500 flex items-center"><ArrowLeft className="w-4 h-4 mr-1"/> Back</button>
                    <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-red-400 flex items-center ml-4">Logout</button>
                </div>
            </div>
            <ComplianceRanking reportsHistory={reportsHistory} loadReportFromHistory={loadReportFromHistory} deleteReport={deleteReport} currentUser={currentUser} />
        </div>
    );
};

const AuthPage = ({ setCurrentPage, setErrorMessage, errorMessage, db, auth }) => {
    const [regForm, setRegForm] = useState({ name: '', designation: '', company: '', email: '', phone: '', password: '' });
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleRegChange = (e) => setRegForm({ ...regForm, [e.target.name]: e.target.value });
    const handleLoginChange = (e) => setLoginForm({ ...loginForm, [e.target.name]: e.target.value });

    const handleRegister = async (e) => {
        e.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);
        try {
            const userCred = await createUserWithEmailAndPassword(auth, regForm.email, regForm.password);
            await setDoc(doc(db, 'users', userCred.user.uid), {
                name: regForm.name,
                designation: regForm.designation,
                company: regForm.company,
                email: regForm.email,
                phone: regForm.phone,
                role: 'USER',
                createdAt: Date.now()
            });
            await signOut(auth);
            setLoginForm({ email: regForm.email, password: regForm.password });
            setErrorMessage('SUCCESS: Registration complete! Use the Email/Password you just created to Sign In.');
        } catch (err) { console.error('Registration error', err); setErrorMessage(err.message || 'Registration failed.'); } finally { setIsSubmitting(false); }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);
        try { await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password); } catch (err) { console.error('Login error', err); setErrorMessage(err.message || 'Login failed.'); setIsSubmitting(false); }
    };
    const isSuccess = errorMessage && errorMessage.includes('SUCCESS');
    return (
        <div className="p-8 bg-slate-800 rounded-2xl shadow-2xl shadow-black/50 border border-slate-700 mt-12 mb-12">
            <h2 className="text-3xl font-extrabold text-white text-center">Welcome to SmartBids</h2>
            <p className="text-lg font-medium text-blue-400 text-center mb-6">AI-Driven Bid Compliance Audit: Smarter Bids, Every Time!</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="p-6 bg-slate-700/50 rounded-xl border border-blue-500/50 shadow-inner space-y-4">
                    <h3 className="text-2xl font-bold text-blue-300 flex items-center mb-4"><UserPlus className="w-6 h-6 mr-2" /> Create Account</h3>
                    <form onSubmit={handleRegister} className="space-y-3">
                        <FormInput id="reg-name" label="Full Name *" name="name" value={regForm.name} onChange={handleRegChange} type="text" />
                        <FormInput id="reg-designation" label="Designation" name="designation" value={regForm.designation} onChange={handleRegChange} type="text" />
                        <FormInput id="reg-company" label="Company" name="company" value={regForm.company} onChange={handleRegChange} type="text" />
                        <FormInput id="reg-email" label="Email *" name="email" value={regForm.email} onChange={handleRegChange} type="email" />
                        <FormInput id="reg-phone" label="Contact Number" name="phone" value={regForm.phone} onChange={handleRegChange} type="tel" placeholder="Optional" />
                        <FormInput id="reg-password" label="Create Password *" name="password" value={regForm.password} onChange={handleRegChange} type="password" />
                        <button type="submit" disabled={isSubmitting} className={`w-full py-3 text-lg font-semibold rounded-xl text-slate-900 transition-all shadow-lg mt-6 bg-blue-400 hover:bg-blue-300 disabled:opacity-50 flex items-center justify-center`}>{isSubmitting ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <UserPlus className="h-5 w-5 mr-2" />}{isSubmitting ? 'Registering...' : 'Register'}</button>
                    </form>
                </div>
                <div className="p-6 bg-slate-700/50 rounded-xl border border-green-500/50 shadow-inner flex flex-col justify-center">
                    <h3 className="text-2xl font-bold text-green-300 flex items-center mb-4"><LogIn className="w-6 h-6 mr-2" /> Sign In</h3>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <FormInput id="login-email" label="Email *" name="email" value={loginForm.email} onChange={handleLoginChange} type="email" />
                        <FormInput id="login-password" label="Password *" name="password" value={loginForm.password} onChange={handleLoginChange} type="password" />
                        <button type="submit" disabled={isSubmitting} className={`w-full py-3 text-lg font-semibold rounded-xl text-slate-900 transition-all shadow-lg mt-6 bg-green-400 hover:bg-green-300 disabled:opacity-50 flex items-center justify-center`}>{isSubmitting ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <LogIn className="h-5 w-5 mr-2" />}{isSubmitting ? 'Signing in...' : 'Sign In'}</button>
                    </form>
                    {errorMessage && (<div className={`mt-4 p-3 ${isSuccess ? 'bg-green-900/40 text-green-300 border-green-700' : 'bg-red-900/40 text-red-300 border-red-700'} border rounded-xl flex items-center`}>{isSuccess ? <CheckCircle className="w-5 h-5 mr-3"/> : <AlertTriangle className="w-5 h-5 mr-3"/>}<p className="text-sm font-medium">{errorMessage}</p></div>)}
                </div>
            </div>
        </div>
    );
};

const AdminDashboard = ({ setCurrentPage, currentUser, reportsHistory, loadReportFromHistory, handleLogout }) => {
  const [userList, setUserList] = useState([]);
  useEffect(() => { getDocs(collection(getFirestore(), 'users')).then(snap => setUserList(snap.docs.map(d => ({ id: d.id, ...d.data() })))); }, []);
  const exportToCSV = (data, filename) => { const csvContent = "data:text/csv;charset=utf-8," + Object.keys(data[0]).join(",") + "\n" + data.map(e => Object.values(e).map(v => `"${v}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = encodeURI(csvContent); link.download = filename; document.body.appendChild(link); link.click(); document.body.removeChild(link); };
  const handleVendorExport = () => { const cleanVendorData = userList.map(u => ({ "Full Name": u.name, "Designation": u.designation, "Company": u.company, "Email": u.email, "Contact Number": u.phone, "Role": u.role })); exportToCSV(cleanVendorData, 'vendor_registry.csv'); };
  const handleMarketExport = () => { const cleanMarketData = reportsHistory.map(r => ({ ID: r.id, Project: r.projectTitle || r.rfqName, Vendor: userList.find(u => u.id === r.ownerId)?.name, Industry: r.industryTag, Value: r.grandTotalValue, Score: r.reportType === 'EXTRACTION' ? 'EXT' : getCompliancePercentage(r) + '%' })); exportToCSV(cleanMarketData, 'market_data.csv'); };
  return (
    <div id="admin-print-area" className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 space-y-8">
      <div className="flex justify-between items-center border-b border-slate-700 pb-4"><h2 className="text-3xl font-bold text-white flex items-center"><Shield className="w-8 h-8 mr-3 text-red-400" /> Admin Market Intel</h2><div className="flex space-x-3 no-print"><button onClick={() => window.print()} className="text-sm text-slate-400 hover:text-white bg-slate-700 px-3 py-2 rounded-lg"><Printer className="w-4 h-4 mr-2" /> Print</button><button onClick={handleLogout} className="text-sm text-slate-400 hover:text-amber-500 flex items-center"><ArrowLeft className="w-4 h-4 mr-1" /> Logout</button></div></div>
      <div className="pt-4 border-t border-slate-700">
        <div className="flex justify-between mb-4"><h3 className="text-xl font-bold text-white flex items-center"><Eye className="w-6 h-6 mr-2 text-amber-400" /> Live Market Feed</h3><button onClick={handleMarketExport} className="text-xs bg-green-700 text-white px-3 py-1 rounded no-print"><Download className="w-3 h-3 mr-1"/> CSV</button></div>
        <div className="space-y-4">{reportsHistory.slice(0, 15).map(item => (
            <div key={item.id} className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 cursor-default hover:bg-slate-900">
                <div className="flex justify-between mb-2"><div><h4 className="text-lg font-bold text-white">{item.projectTitle || item.rfqName || "Extraction Only"}</h4></div><div className="text-right"><div className="text-xl font-bold text-green-400">{item.reportType === 'EXTRACTION' ? 'EXT' : getCompliancePercentage(item) + '%'}</div><span className="text-slate-500 text-xs">{new Date(item.timestamp).toLocaleDateString()}</span></div></div>
            </div>
        ))}</div>
      </div>
      <div className="pt-4 border-t border-slate-700">
         <div className="flex justify-between mb-4"><h3 className="text-xl font-bold text-white"><Users className="w-5 h-5 mr-2 text-blue-400" /> Vendor Registry</h3><button onClick={handleVendorExport} className="text-xs bg-blue-700 text-white px-3 py-1 rounded no-print"><Download className="w-3 h-3 mr-1"/> CSV</button></div>
         <div className="max-h-64 overflow-y-auto bg-slate-900 rounded-xl border border-slate-700"><table className="w-full text-left text-sm text-slate-400"><thead className="bg-slate-800 text-slate-200 uppercase font-bold sticky top-0 z-10"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Designation</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3 text-right">Role</th></tr></thead><tbody className="divide-y divide-slate-800">{userList.map((user, i) => (<tr key={i} className="hover:bg-slate-800/50 transition"><td className="px-4 py-3 font-medium text-white">{user.name}</td><td className="px-4 py-3">{user.designation}</td><td className="px-4 py-3">{user.company}</td><td className="px-4 py-3">{user.email}</td><td className="px-4 py-3">{user.phone || 'N/A'}</td><td className="px-4 py-3 text-right"><span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'ADMIN' ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>{user.role}</span></td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
};

const AuditPage = ({ title, handleAnalyze, handleExtract, usageLimits, setCurrentPage, currentUser, loading, RFQFile, BidFile, setRFQFile, setBidFile, generateTestData, errorMessage, report, saveReport, saving, setErrorMessage, userId, handleLogout }) => {
    return (
        <>
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-3">
                    <h2 className="text-2xl font-bold text-white">{title}</h2>
                    <div className="text-right">
                        {currentUser?.role === 'ADMIN' ? ( <p className="text-xs text-green-400 font-bold">Admin Mode: Unlimited</p> ) : usageLimits.isSubscribed ? (
                            <div className="flex flex-col items-end space-y-1"><div className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500 text-amber-400 text-xs font-bold inline-flex items-center"><Award className="w-3 h-3 mr-1" /> Status: SmartBids Pro Subscribed</div><button onClick={async () => { /* Portal Logic */ }} className="text-xs text-slate-400 hover:text-red-400 flex items-center transition-colors underline decoration-dotted">To Unsubscribe</button></div>
                        ) : ( <p className="text-xs text-slate-400">Audits Used: <span className={usageLimits.bidderChecks >= MAX_FREE_AUDITS ? "text-red-500" : "text-green-500"}>{usageLimits.bidderChecks}/{MAX_FREE_AUDITS}</span></p> )}
                        <button onClick={handleLogout} className="text-sm text-slate-400 hover:text-amber-500 block ml-auto mt-1">Logout</button>
                    </div>
                </div>
                <button onClick={generateTestData} disabled={loading} className="mb-6 w-full flex items-center justify-center px-4 py-3 text-sm font-semibold rounded-xl text-slate-900 bg-teal-400 hover:bg-teal-300 disabled:opacity-30"><Zap className="h-5 w-5 mr-2" /> LOAD DEMO DOCUMENTS</button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FileUploader title="RFQ Document" file={RFQFile} setFile={(e) => handleFileChange(e, setRFQFile, setErrorMessage)} color="blue" requiredText="Mandatory Requirements" />
                    <FileUploader title="Bid Proposal" file={BidFile} setFile={(e) => handleFileChange(e, setBidFile, setErrorMessage)} color="green" requiredText="Response Document (Optional for Extraction)" />
                </div>
                {errorMessage && <div className="mt-6 p-4 bg-red-900/40 text-red-300 border border-red-700 rounded-xl flex items-center"><AlertTriangle className="w-5 h-5 mr-3"/>{errorMessage}</div>}
                
                {/* --- NEW BUTTON LAYOUT --- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                     {/* 1. Full Audit (Requires Both) */}
                    <button 
                        onClick={handleAnalyze} 
                        disabled={loading || !RFQFile || !BidFile} 
                        className="w-full flex items-center justify-center px-6 py-4 text-lg font-semibold rounded-xl text-slate-900 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:bg-slate-700 disabled:text-slate-500 transition-all shadow-lg shadow-amber-500/20"
                    >
                        {loading ? <Loader2 className="animate-spin h-6 w-6 mr-3" /> : <Send className="h-6 w-6 mr-3" />} 
                        {loading ? 'ANALYZING...' : 'RUN COMPLIANCE AUDIT'}
                    </button>

                    {/* 2. Extraction Only (Requires RFQ) */}
                    <button 
                        onClick={handleExtract} 
                        disabled={loading || !RFQFile} 
                        className="w-full flex items-center justify-center px-6 py-4 text-lg font-semibold rounded-xl text-slate-900 bg-teal-400 hover:bg-teal-300 disabled:opacity-50 disabled:bg-slate-700 disabled:text-slate-500 transition-all shadow-lg shadow-teal-500/20"
                    >
                        {loading ? <Loader2 className="animate-spin h-6 w-6 mr-3" /> : <FileSearch className="h-6 w-6 mr-3" />} 
                        {loading ? 'EXTRACTING...' : 'EXTRACT REQUIREMENTS ONLY'}
                    </button>
                </div>

                {report && userId && <button onClick={() => saveReport('BIDDER')} disabled={saving} className="mt-4 w-full flex items-center justify-center px-8 py-3 text-md font-semibold rounded-xl text-white bg-slate-600 hover:bg-slate-500 disabled:opacity-50"><Save className="h-5 w-5 mr-2" /> {saving ? 'SAVING...' : 'SAVE REPORT'}</button>}
                {(report || userId) && <button onClick={() => setCurrentPage(PAGE.HISTORY)} className="mt-2 w-full flex items-center justify-center px-8 py-3 text-md font-semibold rounded-xl text-white bg-slate-700/80 hover:bg-slate-700"><List className="h-5 w-5 mr-2" /> VIEW HISTORY</button>}
            </div>

            {/* --- CONDITIONAL RENDERING OF REPORT TYPE --- */}
            {report && (
                report.reportType === 'EXTRACTION' 
                ? <ExtractionReport report={report} /> 
                : <ComplianceReport report={report} />
            )}
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
    const [usageLimits, setUsageLimits] = useState({ initiatorChecks: 0, bidderChecks: 0, isSubscribed: false });
    const [reportsHistory, setReportsHistory] = useState([]);
    const [showPaywall, setShowPaywall] = useState(false);
    const [RFQFile, setRFQFile] = useState(null);
    const [BidFile, setBidFile] = useState(null);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleLogout = async () => { await signOut(auth); setUserId(null); setCurrentUser(null); setReportsHistory([]); setReport(null); setRFQFile(null); setBidFile(null); setUsageLimits({ initiatorChecks: 0, bidderChecks: 0, isSubscribed: false }); setCurrentPage(PAGE.HOME); setErrorMessage(null); };
    useEffect(() => { if (!auth) return; const unsubscribe = onAuthStateChanged(auth, async (user) => { if (user) { setUserId(user.uid); try { const userDoc = await getDoc(doc(db, 'users', user.uid)); const userData = userDoc.exists() ? userDoc.data() : { role: 'USER' }; setCurrentUser({ uid: user.uid, ...userData }); if (userData.role === 'ADMIN') { setCurrentPage(PAGE.ADMIN); } else { setCurrentPage(PAGE.COMPLIANCE_CHECK); } } catch (error) { setCurrentUser({ uid: user.uid, role: 'USER' }); setCurrentPage(PAGE.COMPLIANCE_CHECK); } } else { setUserId(null); setCurrentUser(null); setReportsHistory([]); setReport(null); setRFQFile(null); setBidFile(null); setCurrentPage(PAGE.HOME); } setIsAuthReady(true); }); return () => unsubscribe(); }, []);
    useEffect(() => { if (db && userId) { const docRef = getUsageDocRef(db, userId); const unsubscribe = onSnapshot(docRef, (docSnap) => { if (docSnap.exists()) { setUsageLimits({ bidderChecks: docSnap.data().bidderChecks || 0, isSubscribed: docSnap.data().isSubscribed || false }); } else { const initialData = { initiatorChecks: 0, bidderChecks: 0, isSubscribed: false }; setDoc(docRef, initialData).catch(e => console.error("Error creating usage doc:", e)); setUsageLimits(initialData); } }, (error) => console.error("Error listening to usage limits:", error)); return () => unsubscribe(); } }, [userId]);
    useEffect(() => { if (!db || !currentUser) return; let unsubscribeSnapshot = null; let q; try { if (currentUser.role === 'ADMIN') { const collectionGroupRef = collectionGroup(db, 'compliance_reports'); q = query(collectionGroupRef); } else if (userId) { const reportsRef = getReportsCollectionRef(db, userId); q = query(reportsRef); } if (q) { unsubscribeSnapshot = onSnapshot(q, (snapshot) => { const history = []; snapshot.forEach(docSnap => { const ownerId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : userId; history.push({ id: docSnap.id, ownerId: ownerId, ...docSnap.data() }); }); history.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); setReportsHistory(history); }); } } catch (err) { console.error("Error setting up history listener:", err); } return () => unsubscribeSnapshot && unsubscribeSnapshot(); }, [userId, currentUser]);
    useEffect(() => { const loadScript = (src) => { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; } const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(); document.head.appendChild(script); }); }; const loadAllLibraries = async () => { try { if (!window.pdfjsLib) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"); if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js'; if (!window.mammoth) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth.js/1.4.15/mammoth.browser.min.js"); } catch (e) { console.warn("Doc parsing libs warning:", e); } }; loadAllLibraries(); const params = new URLSearchParams(window.location.search); if (params.get('client_reference_id') || params.get('payment_success')) { window.history.replaceState({}, document.title, "/"); } }, []); 
    const incrementUsage = async () => { if (!db || !userId) return; const docRef = getUsageDocRef(db, userId); try { await runTransaction(db, async (transaction) => { const docSnap = await transaction.get(docRef); const currentData = docSnap.exists() ? docSnap.data() : { bidderChecks: 0, isSubscribed: false }; if (!docSnap.exists()) transaction.set(docRef, currentData); transaction.update(docRef, { bidderChecks: (currentData.bidderChecks || 0) + 1 }); }); } catch (e) { console.error("Usage update failed:", e); } };

    const handleAnalyze = useCallback(async () => {
        if (currentUser?.role !== 'ADMIN' && !usageLimits.isSubscribed && usageLimits.bidderChecks >= MAX_FREE_AUDITS) { setShowPaywall(true); return; }
        if (!RFQFile || !BidFile) { setErrorMessage("Please upload both documents."); return; }
        setLoading(true); setReport(null); setErrorMessage(null);

        try {
            const rfqContent = await processFile(RFQFile);
            const bidContent = await processFile(BidFile);
            
             const fullSystemPrompt = {
                parts: [{
                    text: `You are the SmartBid Compliance Auditor & Coach.
                    **TASK 1: Market Intel**
                    1. EXTRACT 'projectTitle', 'grandTotalValue', 'primaryRisk', 'rfqScopeSummary'.
                    2. EXTRACT 'projectLocation', 'contractDuration', 'techKeywords', 'requiredCertifications'.
                    3. CLASSIFY 'industryTag': STRICTLY choose one: 'Energy / Oil & Gas', 'Construction / Infrastructure', 'IT / SaaS / Technology', 'Healthcare / Medical', 'Logistics / Supply Chain', 'Consulting / Professional Services', 'Manufacturing / Industrial', 'Financial Services', or 'Other'.
                    4. CLASSIFY 'buyingPersona': 'PRICE-DRIVEN' or 'VALUE-DRIVEN'.
                    5. SCORE 'complexityScore': 1-10.
                    6. COUNT 'trapCount'.
                    7. ASSESS 'leadTemperature'.
                    **TASK 2: Bid Coaching**
                    1. GENERATE 'generatedExecutiveSummary'.
                    2. CALCULATE 'persuasionScore'.
                    3. ANALYZE 'toneAnalysis'.
                    4. FIND 'weakWords'.
                    5. JUDGE 'procurementVerdict'.
                    6. ALERT 'legalRiskAlerts'.
                    7. CHECK 'submissionChecklist'.
                    **TASK 3: Compliance Audit**
                    1. Identify mandatory requirements.
                    2. Score (1/0.5/0).
                    3. CRITICAL: Copy EXACT text to 'requirementFromRFQ'.
                    4. NEGOTIATION: If score < 1, write a diplomatic Sales Argument.
                    Output JSON.`
                }]
            };

            const userQuery = `RFQ:\n${rfqContent}\n\nBid:\n${bidContent}\n\nPerform audit.`;
            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: fullSystemPrompt,
                generationConfig: { responseMimeType: "application/json", responseSchema: COMPREHENSIVE_REPORT_SCHEMA },
            };

            const response = await fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (jsonText) {
                const parsed = JSON.parse(jsonText);
                parsed.reportType = 'COMPLIANCE'; 
                setReport(parsed);
                await incrementUsage();
            } else { throw new Error("AI returned invalid data."); }

        } catch (error) { setErrorMessage(`Analysis failed: ${error.message}`); } finally { setLoading(false); }
    }, [RFQFile, BidFile, usageLimits, currentUser]);

    const handleExtract = useCallback(async () => {
        if (currentUser?.role !== 'ADMIN' && !usageLimits.isSubscribed && usageLimits.bidderChecks >= MAX_FREE_AUDITS) { setShowPaywall(true); return; }
        if (!RFQFile) { setErrorMessage("Please upload an RFQ Document."); return; }
        setLoading(true); setReport(null); setErrorMessage(null);

        try {
            const rfqContent = await processFile(RFQFile);
            
            const systemPrompt = {
                parts: [{
                    text: `You are a Bid Compliance Officer. "Shred" this Tender Document (SOW).
                    
                    **TASK 1: Extract Project Essence (Executive Brief)**
                    1. 'projectTitle': Official Title.
                    2. 'projectLocation': Site/Geography.
                    3. 'coreScope': A one-liner describing the main job.
                    4. 'keyDeliverables': List major hardware/outputs (e.g. '1200MT Module').
                    5. 'strategicConstraints': Local content, specific yards, software versions.
                    6. 'commercialRisks': Liquidated damages, free storage days, tax duties.
                    7. 'criticalTimelines': Key dates.

                    **TASK 2: Detailed Compliance Matrix**
                    Extract EVERY single mandatory requirement.
                    1. Detect Directives: 'Shall', 'Must', 'Will', 'Required', 'Prohibited'.
                    2. Categorize: 'SCOPE', 'TECHNICAL', 'COMMERCIAL', 'ADMIN' (Formatting, paper size), 'HSE', 'LOGISTICS'.
                    3. 'strictness': 'MANDATORY', 'CRITICAL', 'HIGH_COST', 'HIDDEN_COST'.
                    4. 'requirementVerbatim': QUOTE EXACT TEXT.
                    5. 'actionItem': Brief instruction (e.g. 'Quote HBT tools').

                    Do not summarize generic points. Extract specific details like font sizes, room dimensions, software names.
                    Output JSON.`
                }]
            };

            const userQuery = `RFQ Document Content:\n${rfqContent}\n\nPerform Extraction.`;
            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: systemPrompt,
                generationConfig: { responseMimeType: "application/json", responseSchema: RFQ_EXTRACTION_SCHEMA },
            };

            const response = await fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (jsonText) {
                const parsed = JSON.parse(jsonText);
                parsed.reportType = 'EXTRACTION'; 
                setReport(parsed);
                await incrementUsage();
            } else { throw new Error("AI returned invalid data."); }

        } catch (error) { setErrorMessage(`Extraction failed: ${error.message}`); } finally { setLoading(false); }
    }, [RFQFile, usageLimits, currentUser]);

    const generateTestData = useCallback(async () => { const mockRfqContent = `PROJECT TITLE: OFFSHORE PIPELINE MAINT.\nSCOPE: Inspect pipelines.\n1. TECH: REST API required.`; const mockBidContent = `EXECUTIVE SUMMARY: We will do it.\n1. We use GraphQL.`; setRFQFile(new File([mockRfqContent], "MOCK_RFQ.txt", { type: "text/plain" })); setBidFile(new File([mockBidContent], "MOCK_BID.txt", { type: "text/plain" })); setErrorMessage("Mock docs loaded. Click Run Audit."); }, []);
    const saveReport = useCallback(async (role) => { if (!db || !userId || !report) { setErrorMessage("No report to save."); return; } setSaving(true); try { const reportsRef = getReportsCollectionRef(db, userId); await addDoc(reportsRef, { ...report, rfqName: RFQFile?.name || 'Untitled', bidName: BidFile?.name || 'Untitled', timestamp: Date.now(), role: role, ownerId: userId, reportType: report.reportType || 'COMPLIANCE' }); setErrorMessage("Report saved successfully!"); setTimeout(() => setErrorMessage(null), 3000); } catch (error) { setErrorMessage(`Failed to save: ${error.message}.`); } finally { setSaving(false); } }, [db, userId, report, RFQFile, BidFile]);
    const deleteReport = useCallback(async (reportId, rfqName, bidName) => { if (!db || !userId) return; setErrorMessage(`Deleting...`); try { const reportsRef = getReportsCollectionRef(db, userId); await deleteDoc(doc(reportsRef, reportId)); if (report && report.id === reportId) setReport(null); setErrorMessage("Deleted!"); setTimeout(() => setErrorMessage(null), 3000); } catch (error) { setErrorMessage(`Delete failed: ${error.message}`); } }, [db, userId, report]);
    const loadReportFromHistory = useCallback((historyItem) => { setRFQFile(null); setBidFile(null); setReport({ id: historyItem.id, ...historyItem }); setCurrentPage(PAGE.COMPLIANCE_CHECK); setErrorMessage(`Loaded: ${historyItem.rfqName}`); setTimeout(() => setErrorMessage(null), 3000); }, []);

    const renderPage = () => {
        switch (currentPage) {
            case PAGE.HOME: return <AuthPage setCurrentPage={setCurrentPage} setErrorMessage={setErrorMessage} errorMessage={errorMessage} db={db} auth={auth} />;
            case PAGE.COMPLIANCE_CHECK:
                return <AuditPage 
                    title="Bidder: Self-Compliance Check" 
                    handleAnalyze={handleAnalyze} 
                    handleExtract={handleExtract} 
                    usageLimits={usageLimits} setCurrentPage={setCurrentPage} currentUser={currentUser} loading={loading} RFQFile={RFQFile} BidFile={BidFile} setRFQFile={setRFQFile} setBidFile={setBidFile} generateTestData={generateTestData} errorMessage={errorMessage} report={report} saveReport={saveReport} saving={saving} setErrorMessage={setErrorMessage} userId={userId} handleLogout={handleLogout}
                />;
            case PAGE.ADMIN: return <AdminDashboard setCurrentPage={setCurrentPage} currentUser={currentUser} reportsHistory={reportsHistory} loadReportFromHistory={loadReportFromHistory} handleLogout={handleLogout} />;
            case PAGE.HISTORY: return <ReportHistory reportsHistory={reportsHistory} loadReportFromHistory={loadReportFromHistory} deleteReport={deleteReport} isAuthReady={isAuthReady} userId={userId} setCurrentPage={setCurrentPage} currentUser={currentUser} handleLogout={handleLogout} />;
            default: return <AuthPage setCurrentPage={setCurrentPage} setErrorMessage={setErrorMessage} errorMessage={errorMessage} db={db} auth={auth} />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 font-body p-4 sm:p-8 text-slate-100">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@100..900&display=swap');
                .font-body, .font-body * { font-family: 'Lexend', sans-serif !important; }
                input[type="file"] { display: block; width: 100%; }
                input[type="file"]::file-selector-button { background-color: #f59e0b; color: #1e293b; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 600; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #475569; border-radius: 3px; }
                @media print { 
                    body * { visibility: hidden; } 
                    #admin-print-area, #admin-print-area * { visibility: visible; } 
                    #admin-print-area { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; } 
                    #printable-compliance-report, #printable-compliance-report * { visibility: visible; }
                    #printable-compliance-report { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; }
                    .no-print { display: none !important; } 
                }
            `}</style>
            <div className="max-w-4xl mx-auto space-y-10">{renderPage()}</div>
            <PaywallModal show={showPaywall} onClose={() => setShowPaywall(false)} userId={userId} />
        </div>
    );
};

const MainApp = App;

function TopLevelApp() {
    return (
        <ErrorBoundary>
            <MainApp />
        </ErrorBoundary>
    );
}

export default TopLevelApp;
