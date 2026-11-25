
import React, { useState } from 'react';
import { X, Copy, Database, Server, Check, CloudLightning, Flame } from 'lucide-react';

interface ServerHelpProps {
  onClose: () => void;
}

const ServerHelp: React.FC<ServerHelpProps> = ({ onClose }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<'SQL' | 'FIREBASE'>('FIREBASE');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const sqlCode = `
-- OPTION A: TRADITIONAL SQL (Your current setup)
CREATE DATABASE apsrtc_db;
USE apsrtc_db;

CREATE TABLE conductors (
    employee_id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    master_photo LONGTEXT,
    last_login TIMESTAMP
);
`;

  const firebaseGuide = `
// OPTION B: GOOGLE FIREBASE (Best for Google Cloud Deployment)
// 1. Go to console.firebase.google.com
// 2. Create Project -> Enable "Authentication" & "Firestore"
// 3. Copy your firebaseConfig object

// In authService.ts, you would replace the logic with:
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  // ... other config
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// This allows login on ANY device immediately!
`;

  return (
    <div className="fixed inset-0 z-[100] bg-brand-dark/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[2rem] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in duration-300">
        
        {/* Header */}
        <div className="bg-brand-red p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-white/10 rounded-xl">
               {tab === 'FIREBASE' ? <Flame size={24} className="text-brand-yellow" /> : <Database size={24} className="text-brand-yellow" />}
             </div>
             <div>
               <h2 className="text-lg font-black uppercase tracking-tight">Sync Configuration</h2>
               <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Choose your Backend Strategy</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button 
            onClick={() => setTab('FIREBASE')}
            className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-colors ${tab === 'FIREBASE' ? 'bg-orange-50 text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Option 1: Google Firebase
          </button>
          <button 
            onClick={() => setTab('SQL')}
            className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest transition-colors ${tab === 'SQL' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            Option 2: SQL Server
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {tab === 'FIREBASE' && (
            <div className="space-y-4 animate-in slide-in-from-right duration-300">
               <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl flex gap-3">
                  <CloudLightning size={24} className="text-orange-500 shrink-0" />
                  <div>
                    <h3 className="text-xs font-black text-orange-700 uppercase">Recommended for Google Cloud</h3>
                    <p className="text-[10px] text-orange-600 leading-relaxed mt-1">
                      Since you are deploying to Google Cloud, <strong>Firebase</strong> is the easiest way to sync data. It is serverless, free for small apps, and handles "User A on Phone 1 -&gt; User A on Phone 2" automatically.
                    </p>
                  </div>
               </div>
               <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-gray-400 uppercase">Implementation Guide</label>
                    <button onClick={() => copyToClipboard(firebaseGuide, 'fb')} className="text-[9px] font-bold text-orange-500 flex items-center gap-1">
                      {copied === 'fb' ? <Check size={12} /> : <Copy size={12} />} Copy Guide
                    </button>
                 </div>
                 <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl text-[10px] font-mono overflow-x-auto border-l-4 border-orange-500">
                    {firebaseGuide}
                 </pre>
               </div>
            </div>
          )}

          {tab === 'SQL' && (
            <div className="space-y-4 animate-in slide-in-from-left duration-300">
               <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                 <p className="text-[10px] text-blue-700 leading-relaxed">
                   Use this if you have a dedicated VPS or prefer relational databases (MySQL/PostgreSQL).
                 </p>
               </div>
               <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-gray-400 uppercase">SQL Schema</label>
                    <button onClick={() => copyToClipboard(sqlCode, 'sql')} className="text-[9px] font-bold text-blue-500 flex items-center gap-1">
                      {copied === 'sql' ? <Check size={12} /> : <Copy size={12} />} Copy SQL
                    </button>
                 </div>
                 <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl text-[10px] font-mono overflow-x-auto border-l-4 border-blue-500">
                    {sqlCode}
                 </pre>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServerHelp;
