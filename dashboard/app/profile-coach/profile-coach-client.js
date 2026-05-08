'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * api.js throws new Error(rawResponseText) on non-2xx.
 * The backend sends { error: { code, message } }.
 * Parse it so we can branch on the error code.
 */
function parseApiError(err) {
  try {
    const parsed = JSON.parse(err?.message || '');
    return {
      code: parsed?.error?.code || 'UNKNOWN',
      message: parsed?.error?.message || err?.message || 'Unknown error',
    };
  } catch {
    return { code: 'UNKNOWN', message: err?.message || 'Unknown error' };
  }
}

function scoreColor(score) {
  if (score >= 75) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function scoreBg(score) {
  if (score >= 75) return 'bg-green-50 border-green-200';
  if (score >= 50) return 'bg-yellow-50 border-yellow-200';
  return 'bg-red-50 border-red-200';
}

function ScoreBadge({ score, size = 'normal' }) {
  const color = scoreColor(score);
  const bg = scoreBg(score);
  if (size === 'large') {
    return (
      <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full border-4 ${bg} ${color}`}>
        <span className="text-3xl font-extrabold">{score}</span>
      </div>
    );
  }
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-sm font-semibold border ${bg} ${color}`}>
      {score}/100
    </span>
  );
}

function IssuesList({ issues }) {
  if (!issues?.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {issues.map((issue, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
          <span className="mt-0.5 text-red-400 flex-shrink-0">&#8226;</span>
          {issue}
        </li>
      ))}
    </ul>
  );
}

function TagList({ items, color }) {
  if (!items?.length) return <span className="text-sm text-gray-400">None</span>;
  const cls = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    gray: 'bg-gray-100 text-gray-700',
  }[color] || 'bg-gray-100 text-gray-700';
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {items.map((item, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{item}</span>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ProfileCoachClient() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { code, message }

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post('/profile-coach/analyze', {});
      setResult(data);
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  }

  const isEmptyProfile = error?.code === 'VALIDATION_ERROR';
  const isLlmFailed = error?.code === 'PROFILE_ANALYSIS_FAILED';

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profile Coach</h1>
        <p className="text-gray-600 mt-1">
          Get an LLM-powered audit of your Upwork profile with concrete, copy-pasteable rewrites.
        </p>
      </div>

      {/* Trigger card */}
      {!result && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <p className="text-sm text-gray-600 mb-4">
            Run a fresh LLM analysis of your Upwork profile (~5 seconds, costs a small LLM call).
            The analysis grades your headline, summary, skills, and rate — and gives you copy you
            can paste directly into Upwork.
          </p>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? 'Analyzing…' : 'Analyze my profile'}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 text-gray-600 text-sm py-4">
          <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Analyzing your profile…
        </div>
      )}

      {/* Error states */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-red-800 text-sm font-medium">{error.message}</p>
          {isEmptyProfile && (
            <p className="text-red-700 text-sm mt-1">
              <Link href="/profile" className="underline font-semibold">Go to your Profile</Link>
              {' '}to add a title, summary, and skills first.
            </p>
          )}
          {isLlmFailed && (
            <button
              onClick={runAnalysis}
              className="mt-3 px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
            >
              Try again
            </button>
          )}
          {!isEmptyProfile && !isLlmFailed && (
            <button
              onClick={runAnalysis}
              className="mt-3 px-4 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Overall score */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 flex items-center gap-6">
            <ScoreBadge score={result.overallScore} size="large" />
            <div>
              <div className="text-lg font-bold text-gray-900">Overall Profile Score</div>
              <p className="text-sm text-gray-500 mt-0.5">
                {result.overallScore >= 75 && 'Strong profile. A few tweaks can push you to the top.'}
                {result.overallScore >= 50 && result.overallScore < 75 && 'Room to improve. Address the issues below to increase your hire rate.'}
                {result.overallScore < 50 && 'Your profile needs significant rework. Follow the action items below.'}
              </p>
            </div>
          </div>

          {/* Dimension cards */}
          <div className="grid gap-4 mb-6">

            {/* Headline */}
            {result.headline && (
              <div className={`bg-white border rounded-xl p-5 ${scoreBg(result.headline.score)}`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">Headline</h2>
                  <ScoreBadge score={result.headline.score} />
                </div>
                <IssuesList issues={result.headline.issues} />
                {result.headline.rewriteSuggestion && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Suggested rewrite</div>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-medium">
                      {result.headline.rewriteSuggestion}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            {result.summary && (
              <div className={`bg-white border rounded-xl p-5 ${scoreBg(result.summary.score)}`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">Summary</h2>
                  <ScoreBadge score={result.summary.score} />
                </div>
                <IssuesList issues={result.summary.issues} />
                {result.summary.openingRewrite && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Opening rewrite (first ~200 chars)</div>
                    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 italic">
                      {result.summary.openingRewrite}
                    </div>
                  </div>
                )}
                {result.summary.structureSuggestion && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">How to structure the rest</div>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{result.summary.structureSuggestion}</p>
                  </div>
                )}
              </div>
            )}

            {/* Skills */}
            {result.skills && (
              <div className={`bg-white border rounded-xl p-5 ${scoreBg(result.skills.score)}`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">Skills</h2>
                  <ScoreBadge score={result.skills.score} />
                </div>
                <IssuesList issues={result.skills.issues} />
                {(result.skills.missing?.length > 0) && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Missing (add these)</div>
                    <TagList items={result.skills.missing} color="green" />
                  </div>
                )}
                {(result.skills.redundant?.length > 0) && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Redundant (consider removing)</div>
                    <TagList items={result.skills.redundant} color="red" />
                  </div>
                )}
              </div>
            )}

            {/* Rate */}
            {result.rate && (
              <div className={`bg-white border rounded-xl p-5 ${scoreBg(result.rate.score)}`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">Hourly Rate</h2>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      result.rate.verdict === 'right'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : result.rate.verdict === 'low'
                          ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          : 'bg-red-100 text-red-800 border-red-200'
                    }`}>
                      {result.rate.verdict === 'right' ? 'Right' : result.rate.verdict === 'low' ? 'Too low' : 'Too high'}
                    </span>
                    <ScoreBadge score={result.rate.score} />
                  </div>
                </div>
                {result.rate.reason && (
                  <p className="text-sm text-gray-700">{result.rate.reason}</p>
                )}
              </div>
            )}
          </div>

          {/* Action priority */}
          {result.actionPriority?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
              <h2 className="font-semibold text-gray-900 mb-3">Top 3 Changes to Make First</h2>
              <ol className="space-y-2">
                {result.actionPriority.map((action, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-800">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Re-run */}
          <div className="flex justify-end">
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition"
            >
              Re-run analysis
            </button>
          </div>
        </>
      )}
    </div>
  );
}
