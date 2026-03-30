import { useParams } from 'react-router-dom';

export default function TripSummaryPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="w-full max-w-md mx-auto h-screen flex items-center justify-center bg-bg-light">
      <div className="text-center px-4">
        <h1 className="text-3xl font-bold text-text-primary">Trip Summary</h1>
        <p className="text-text-secondary mt-2">Trip ID: {id}</p>
        <p className="text-text-secondary">Trip details and earnings breakdown</p>
      </div>
    </div>
  );
}
