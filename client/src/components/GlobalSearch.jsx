import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { flattenNav } from '../navConfig';
import { isModuleApplicable } from '../moduleApplicability';
import { IconSearch } from './icons';

const ALL_ITEMS = flattenNav();

export default function GlobalSearch() {
  const { hasPermission, company } = useAuth();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return [];
    return ALL_ITEMS
      // Search must respect the same Nature-of-Business gating the
      // sidebar itself applies — otherwise a company outside education
      // could search for and land on "Students & Admissions" even
      // though that entire module is deliberately hidden from their own
      // sidebar, the same inconsistency this whole gating system exists
      // to prevent.
      .filter((item) => isModuleApplicable(item.section, company?.nature_of_business))
      .filter((item) => !item.permission || hasPermission(item.permission))
      .filter((item) => item.label.toLowerCase().includes(q) || item.section.toLowerCase().includes(q))
      .slice(0, 8);
  }, [q, hasPermission, company?.nature_of_business]);

  function go(item) {
    setQuery('');
    setOpen(false);
    navigate(item.to);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && results.length > 0) go(results[0]);
    if (e.key === 'Escape') { setQuery(''); setOpen(false); }
  }

  return (
    <div ref={containerRef} className="global-search">
      <IconSearch className="global-search-icon" />
      <input
        type="text"
        placeholder="Search pages…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        aria-label="Search the app"
      />
      {open && q && (
        <div className="global-search-results">
          {results.length === 0 ? (
            <div className="global-search-empty">No pages match "{query}".</div>
          ) : (
            results.map((item) => (
              <button key={item.to} className="global-search-result" onClick={() => go(item)}>
                <span className="global-search-result-label">{item.label}</span>
                <span className="global-search-result-section">{item.section}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
