import React, { useState } from 'react';
import { Customer, CustomerStatus } from '../types';
import { StarIcon, XIcon, CheckCircleIcon } from '../components/icons';

interface FunnelPageProps {
  customer: Customer;
  businessName: string;
  googleReviewLink: string;
  onComplete: (customerId: string, rating: number) => void;
  onClose: () => void;
}

const FunnelPage: React.FC<FunnelPageProps> = ({ customer, businessName, googleReviewLink, onComplete, onClose }) => {
  const [submittedRating, setSubmittedRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState(0);

  const handleRating = (rating: number) => {
    // Log the completion for analytics regardless of path.
    onComplete(customer.id, rating);

    // This is the core filtering logic.
    if (rating >= 4) {
      // POSITIVE FEEDBACK: Immediately redirect to Google.
      if (googleReviewLink && googleReviewLink.trim() !== "") {
        // Using window.location.href for a direct redirect in the same tab.
        window.location.href = googleReviewLink;
      } else {
        console.warn("Google Review Link is not configured. Cannot redirect.");
        // As a fallback, show a thank you page if the link is missing.
        setSubmittedRating(rating);
      }
    } else {
      // NEGATIVE FEEDBACK: Show the internal "Thank You" page.
      setSubmittedRating(rating);
    }
  };

  const Star = ({ filled, hovered }: { filled: boolean; hovered?: boolean }) => (
    <StarIcon className={`w-10 h-10 transition-colors duration-200 ${filled || hovered ? 'text-yellow-400' : 'text-gray-300'}`} />
  );

  const RatingView = () => (
    <>
      <h2 className="text-2xl font-bold text-gray-800 text-center">How was your experience?</h2>
      <p className="text-gray-500 text-center mt-2">Your feedback helps us improve.</p>
      <div className="flex justify-center items-center space-x-2 my-8">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={`Rate ${star} stars`}
          >
            <Star filled={star <= (customer.rating || 0)} hovered={star <= hoverRating} />
          </button>
        ))}
      </div>
    </>
  );
  
  // This view is now only shown for negative feedback, or as a fallback if the Google link is missing.
  const ThankYouView = () => (
     <div className="text-center">
        <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">Thank You for Your Feedback!</h2>
        <p className="text-gray-600 mt-4 text-sm max-w-xs mx-auto">
            We appreciate you taking the time to share your thoughts. We'll use your feedback to improve.
        </p>
        <button onClick={onClose} className="mt-8 text-sm text-primary-600 hover:underline font-semibold">
            Close
        </button>
     </div>
  );

  const AlreadyReviewedView = () => (
    <div className="text-center">
        <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800">Thank you, {customer.name.split(' ')[0]}!</h2>
        <p className="text-gray-500 mt-2">We have already received your feedback.</p>
        <button onClick={onClose} className="mt-8 text-sm text-primary-600 hover:underline font-semibold">
            Close Window
        </button>
    </div>
  );
  
  // Logic to determine which view to show.
  const renderContent = () => {
    // If a negative rating was submitted, show the internal thank you message.
    if (submittedRating !== null) {
      return <ThankYouView />;
    }
    // If the customer has reviewed in the past, show the already reviewed message.
    if (customer.status === CustomerStatus.Reviewed) {
      return <AlreadyReviewedView />;
    }
    // Otherwise, show the rating prompt.
    return <RatingView />;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
            <XIcon className="w-6 h-6"/>
        </button>
        <div className="text-center mb-8">
            <h1 className="text-xl font-semibold text-gray-700">{businessName}</h1>
        </div>
        
        {renderContent()}

      </div>
    </div>
  );
};

export default FunnelPage;
