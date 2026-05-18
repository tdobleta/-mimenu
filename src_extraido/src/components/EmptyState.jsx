import { Link } from 'react-router-dom';

export default function EmptyState({ title, subtitle, linkText, linkTo }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <p style={{ fontSize: 15, fontWeight: 500, color: 'rgba(0,0,0,0.6)' }}>{title}</p>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', marginTop: 4 }}>{subtitle}</p>
      )}
      {linkText && linkTo && (
        <Link to={linkTo} 
          className="mt-4 px-4 py-2 text-white text-sm"
          style={{ backgroundColor: '#1D9E75', borderRadius: 6 }}>
          {linkText}
        </Link>
      )}
    </div>
  );
}


