import React from 'react';

const VerificationConfirmed = () => {
    return (
        <div className="verification-page">
            <div className="container py-5">
                <div className="row justify-content-center">
                    <div className="col-md-6">
                        <div className="card shadow text-center">
                            <div className="card-body p-5">
                                <h2 className="card-title text-success mb-4">Verification Confirmed</h2>
                                <p className="lead">Your account has been successfully verified.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VerificationConfirmed;
