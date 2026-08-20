import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

interface Props {
  studentName?: string;
  defaultUniversity?: string;
  defaultCourse?: string;
  defaultCountry?: string;
}

export default function AiSopStudio({
  studentName = 'Rahul Sharma',
  defaultUniversity = 'University of Manchester',
  defaultCourse = 'MSc Data Science & Artificial Intelligence',
  defaultCountry = 'United Kingdom',
}: Props) {
  const [name, setName] = useState(studentName);
  const [targetUniversity, setTargetUniversity] = useState(defaultUniversity);
  const [targetCourse, setTargetCourse] = useState(defaultCourse);
  const [targetCountry, setTargetCountry] = useState(defaultCountry);
  const [educationalBackground, setEducationalBackground] = useState(
    'B.Tech in Computer Science Engineering (74% aggregate), with core coursework in Algorithms, DBMS, and Machine Learning.'
  );
  const [careerGoals, setCareerGoals] = useState(
    'To specialize in Enterprise AI Architecture and lead scalable data analytics solutions at multinational tech firms.'
  );
  const [keyProjects, setKeyProjects] = useState(
    'Developed a sentiment analysis engine using PyTorch and completed a 6-month internship as Junior Python Developer.'
  );
  const [whyUniversity, setWhyUniversity] = useState(
    'World-renowned faculty in computational intelligence, high industry graduate employability, and state-of-the-art research labs.'
  );

  const [generatedSop, setGeneratedSop] = useState<string>('');

  const sopMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/staff/ai/generate-sop', { credentials: 'include', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: name,
          targetUniversity,
          targetCourse,
          targetCountry,
          educationalBackground,
          careerGoals,
          keyProjectsOrAchievements: keyProjects,
          whyThisUniversity: whyUniversity,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'SOP generation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedSop(data.sop);
    },
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedSop);
    alert('SOP copied to clipboard!');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 text-lg">
            ✍️
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              AI Statement of Purpose (SOP) & Cover Letter Studio
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Staff Only
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Generates high-scoring, academic SOPs tailored to university admissions & visa officers
            </p>
          </div>
        </div>
      </div>

      {/* Input Parameters Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Student Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Country</label>
          <input
            type="text"
            value={targetCountry}
            onChange={(e) => setTargetCountry(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target University</label>
          <input
            type="text"
            value={targetUniversity}
            onChange={(e) => setTargetUniversity(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Course / Degree</label>
          <input
            type="text"
            value={targetCourse}
            onChange={(e) => setTargetCourse(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Educational Background</label>
          <textarea
            rows={2}
            value={educationalBackground}
            onChange={(e) => setEducationalBackground(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Short & Long-term Career Goals</label>
          <textarea
            rows={2}
            value={careerGoals}
            onChange={(e) => setCareerGoals(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Key Projects & Experience</label>
          <textarea
            rows={2}
            value={keyProjects}
            onChange={(e) => setKeyProjects(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Why this University & Faculty</label>
          <textarea
            rows={2}
            value={whyUniversity}
            onChange={(e) => setWhyUniversity(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => sopMutation.mutate()}
          disabled={sopMutation.isPending}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-purple-600/20"
        >
          {sopMutation.isPending ? 'Generating Statement of Purpose...' : '⚡ Generate Academic SOP'}
        </button>
      </div>

      {/* Generated Output */}
      {generatedSop && (
        <div className="mt-6 border-t border-slate-800 pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <span>📄</span> Generated Statement of Purpose
            </h4>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
            >
              📋 Copy to Clipboard
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
            {generatedSop}
          </div>
        </div>
      )}
    </div>
  );
}
