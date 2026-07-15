import { useRef, useState, useEffect } from 'react';

export default function CategoryNav({ categories, selected, onSelect }) {
  const navRef = useRef(null);
  const [fade, setFade] = useState({ start: true, end: false });

  const update = () => {
    const nav = navRef.current;
    if (!nav) return;
    const atStart = nav.scrollLeft <= 1;
    const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;
    setFade({ start: atStart, end: atEnd });
  };

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [categories]);

  return (
    <div className={`categories-wrapper ${!fade.start ? 'scrolled' : 'at-start'} ${fade.end ? 'at-end' : ''}`}>
      <nav className="categories-nav" ref={navRef} onScroll={update}>
        {categories.map((cat) => (
          <button
            key={cat}
            className={cat === selected ? 'selected' : ''}
            onClick={() => onSelect(cat)}
            type="button"
          >
            {cat}
          </button>
        ))}
      </nav>
    </div>
  );
}
