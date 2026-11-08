import BookingPanel from '../scheduling/BookingPanel';
import { useState } from 'react';
import AccountHome from '../../components/AccountHome';
import AvailabilityPanel from '../scheduling/AvailabilityPanel';
import EmployerWorkspace from './EmployerWorkspace';

export default function EmployerDashboard({ user, onUserChanged, onLoggedOut }) {
  const [revision, setRevision] = useState(0);
  return <div className="employer-dashboard">
    <AccountHome user={user} onUserChanged={onUserChanged} onLoggedOut={onLoggedOut} />
    <div className="employer-content">
      <EmployerWorkspace user={user} onLoggedOut={onLoggedOut} embedded onJobsChanged={() => setRevision((value) => value + 1)} />
      <AvailabilityPanel onLoggedOut={onLoggedOut} revision={revision} />
      <BookingPanel role="Employer" onLoggedOut={onLoggedOut} />
    </div>
  </div>;
}
