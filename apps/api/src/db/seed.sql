-- Pipeline Stages
INSERT OR REPLACE INTO pipeline_stages (id, key, name, sequence, wip_limit, created_at) VALUES
('stage-1', 'lead', 'Lead Intake', 1, NULL, 1717171717),
('stage-2', 'qualified', 'Qualified', 2, NULL, 1717171717),
('stage-3', 'documents', 'Documents', 3, NULL, 1717171717),
('stage-4', 'processing', 'Processing', 4, 5, 1717171717),
('stage-5', 'complete', 'Complete', 5, NULL, 1717171717);

-- Users / Staff
INSERT OR REPLACE INTO users (id, name, email, email_verified, role, user_divisions, created_at, updated_at) VALUES
('user-counselor-1', 'Rahul Counselor', 'counselor@test.com', 1, 'counselor', '["study-abroad","visa"]', 1717171717, 1717171717),
('user-manager-1', 'Meera Manager', 'manager@test.com', 1, 'manager', '["study-abroad","visa","umrah","attestation","manpower"]', 1717171717, 1717171717),
('user-admin-1', 'Admin Owner', 'admin@test.com', 1, 'super_admin', '["study-abroad","visa","umrah","attestation","manpower"]', 1717171717, 1717171717);

-- Clause Library
INSERT OR REPLACE INTO clause_library (id, clause_id, title, body, division, mandatory, version, created_at) VALUES
('c-refund', 'refund-policy', 'Refund Policy', 'The registration deposit is non-refundable. Subsequent milestones follow a sliding scale.', 'study-abroad', 1, 'v1.0', 1717171717),
('c-fee', 'fee-schedule', 'Fee Payment Terms', 'All milestones must be paid in full within 7 business days of invoice receipt.', 'study-abroad', 1, 'v1.0', 1717171717);

-- Agreement Templates
INSERT OR REPLACE INTO agreement_templates (id, name, division, clauses_json, version, created_at) VALUES
('t-study-abroad', 'Standard Study Abroad Agreement', 'study-abroad', '["refund-policy","fee-schedule"]', 'v1.0', 1717171717);

-- Clients
INSERT OR REPLACE INTO clients (id, name, phone, email, highest_qualification, passport_number, created_at, updated_at) VALUES
('OP-2026-1001', 'Ramesh Kumar', '+91 98765 00001', 'ramesh@test.com', 'undergrad', 'L1234567', 1717171717, 1717171717),
('OP-2026-1002', 'Priya Patel', '+91 98765 00002', 'priya.patel@example.com', 'undergrad', 'L7654321', 1717171717, 1717171717),
('OP-2026-1003', 'Pilgrim Ali', '+91 98765 00003', 'ali@test.com', 'highschool', 'L1111111', 1717171717, 1717171717);

-- Engagements
INSERT OR REPLACE INTO engagements (id, client_id, division, title, stage_key, counselor_id, outstanding_balance, status, created_at, updated_at) VALUES
('eng-1', 'OP-2026-1001', 'study-abroad', 'US Fall 2027 Consulting', 'lead', 'user-counselor-1', 0, 'active', 1717171717, 1717171717),
('eng-2', 'OP-2026-1002', 'manpower', 'Frontend Developer Opportunity', 'qualified', 'user-counselor-1', 0, 'active', 1717171717, 1717171717);

-- Group Departures (Umrah)
INSERT OR REPLACE INTO group_departures (id, package_tier, departure_date, capacity, booked_seats, price, booking_fee, status, created_at) VALUES
('dep-nov-2026', 'standard', 1795000000, 30, 5, 15000000, 1000000, 'open', 1717171717);

-- Universities
INSERT OR REPLACE INTO universities (id, name, country, intake, min_gpa, ielts_min, budget_lpa_min, created_at) VALUES
('uni-oxford', 'University of Oxford', 'UK', 'Fall 2026', 8.5, 7.5, 35, 1717171717),
('uni-cambridge', 'University of Cambridge', 'UK', 'Fall 2026', 8.5, 7.5, 38, 1717171717),
('uni-harvard', 'Harvard University', 'USA', 'Fall 2026', 9.0, 7.5, 45, 1717171717),
('uni-toronto', 'University of Toronto', 'Canada', 'Fall 2026', 8.0, 7.0, 28, 1717171717),
('uni-leeds', 'University of Leeds', 'UK', 'Fall 2026', 7.5, 6.5, 22, 1717171717);

-- Study Abroad Shortlists
INSERT OR REPLACE INTO study_abroad_shortlists (id, client_id, university_id, status, notes, created_at, updated_at) VALUES
('sl-ramesh-oxford', 'OP-2026-1001', 'uni-oxford', 'shortlisted', 'High priority target', 1717171717, 1717171717),
('sl-ramesh-harvard', 'OP-2026-1001', 'uni-harvard', 'submitted', 'Awaiting interview call', 1717171717, 1717171717),
('sl-priya-cambridge', 'OP-2026-1002', 'uni-cambridge', 'docs_uploaded', 'Submitted transcripts', 1717171717, 1717171717);
