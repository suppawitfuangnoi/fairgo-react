import { useParams } from 'react-router-dom';

export default function RatingPage() {
  const { tripId } = useParams<{ tripId: string }>();

  return (
    <div className="w-full max-w-md mx-auto h-screen flex items-center justify-center bg-bg-light">
      <div className="text-center px-4">
        <h1 className="text-3xl font-bold text-text-primary">Rate Customer</h1>
        <p className="text-text-secondary mt-2">Trip ID: {tripId}</p>
        <p className="text-text-secondary">Rate customer and trip quality</p>
      </div>
    </div>
  );
}
