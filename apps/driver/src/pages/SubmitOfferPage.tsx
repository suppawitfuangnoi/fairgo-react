import { useParams } from 'react-router-dom';

export default function SubmitOfferPage() {
  const { rideId } = useParams<{ rideId: string }>();

  return (
    <div className="w-full max-w-md mx-auto h-screen flex items-center justify-center bg-bg-light">
      <div className="text-center px-4">
        <h1 className="text-3xl font-bold text-text-primary">Submit Offer</h1>
        <p className="text-text-secondary mt-2">Ride ID: {rideId}</p>
        <p className="text-text-secondary">Accept ride and set offer price</p>
      </div>
    </div>
  );
}
