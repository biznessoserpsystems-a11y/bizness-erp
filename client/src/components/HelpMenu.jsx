import { useEffect, useRef, useState } from 'react';
import { IconHelp } from './icons';

export default function HelpMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="dropdown-anchor">
      <button className="btn btn-secondary btn-sm icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Help">
        <IconHelp />
      </button>
      {open && (
        <div className="dropdown-menu help-menu">
          <div className="dropdown-menu-title">Help &amp; resources</div>
          <div className="help-menu-item">
            <strong>Keyboard tip</strong>
            <p>Use the search bar above to jump straight to any page — type a few letters and hit Enter.</p>
          </div>
          <div className="help-menu-item">
            <strong>Need a hand?</strong>
            <p>Reach your system administrator or the person who set up Bizness-OS for your organisation.</p>
          </div>
        </div>
      )}
    </div>
  );
}
