export default function ProgressBar({ progress }) {
  if (!progress || progress <= 0) return null;

  return (
    <div className="total-bar">
      <span style={{ width: `${progress}%` }} />
    </div>
  );
}
