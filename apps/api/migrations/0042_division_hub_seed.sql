-- Division hub seed data (idempotent — INSERT OR IGNORE on fixed ids)
-- Universities (Study Abroad eligibility catalog)
INSERT OR IGNORE INTO `universities` (`id`,`name`,`country`,`min_gpa`,`ielts_min`,`budget_lpa_min`,`intake`,`created_at`) VALUES
('u-birmingham','University of Birmingham','UK',7.0,6.0,22,'Fall 2026',1786600000),
('u-manchester','University of Manchester','UK',7.5,6.5,26,'Fall 2026',1786600000),
('u-leeds','University of Leeds','UK',6.5,6.0,20,'Spring 2027',1786600000),
('u-texas','University of Texas at Dallas','USA',7.5,6.5,30,'Fall 2026',1786600000),
('u-sunysb','Stony Brook University','USA',7.0,6.5,28,'Spring 2027',1786600000),
('u-toronto','University of Toronto','Canada',8.0,6.5,34,'Fall 2026',1786600000),
('u-concordia','Concordia University','Canada',6.5,6.5,22,'Fall 2026',1786600000),
('u-sydney','University of Sydney','Australia',7.5,6.5,32,'Fall 2026',1786600000),
('u-deakin','Deakin University','Australia',6.0,6.0,20,'Spring 2027',1786600000),
('u-tum','TU Munich','Germany',8.0,6.5,12,'Fall 2026',1786600000),
('u-bonn','University of Bonn','Germany',7.5,6.0,11,'Spring 2027',1786600000),
('u-heriot','Heriot-Watt University (Dubai)','UAE',6.0,6.0,18,'Fall 2026',1786600000);
--> statement-breakpoint
-- Job postings (Manpower board + careers ticker)
INSERT OR IGNORE INTO `job_postings` (`id`,`title`,`country`,`sector`,`salary_text`,`collar`,`tier`,`status`,`created_at`) VALUES
('job-welder','Structural Welder','Qatar','Construction','QR 2,500 (~₹57,000)','blue_collar','public','open',1786600000),
('job-coordinator','Project Coordinator','UAE','Infrastructure','AED 8,500 (~₹1,92,000)','white_collar','public','open',1786600000),
('job-electrician','Industrial Electrician','Oman','Energy','OMR 350 (~₹75,000)','blue_collar','secret','open',1786600000),
('job-supervisor','Construction Supervisor','Saudi Arabia','Construction','SAR 4,500 (~₹1,00,000)','blue_collar','public','open',1786600000),
('job-hvac','HVAC Technician','Qatar','Facilities','QR 2,200 (~₹50,000)','blue_collar','public','open',1786600000),
('job-accountant','Accounts Officer','UAE','Finance','AED 6,000 (~₹1,35,000)','white_collar','secret','open',1786600000),
('job-nurse','Staff Nurse','Saudi Arabia','Healthcare','SAR 3,800 (~₹85,000)','white_collar','public','open',1786600000),
('job-driver','Heavy Vehicle Driver','Qatar','Logistics','QR 1,900 (~₹43,000)','blue_collar','public','open',1786600000);
--> statement-breakpoint
-- Attestation chains (legalization workflows)
INSERT OR IGNORE INTO `attestation_chains` (`id`,`country`,`steps_json`,`created_at`) VALUES
('chain-uae','UAE 🇦🇪','[{"step":"State HRD Authentication","feePaise":800,"timelineDays":2},{"step":"MEA Legalization","feePaise":700,"timelineDays":3},{"step":"UAE Embassy Attestation","feePaise":1800,"timelineDays":5},{"step":"Ministry of Foreign Affairs (UAE)","feePaise":1200,"timelineDays":2}]',1786600000),
('chain-saudi','Saudi Arabia 🇸🇦','[{"step":"State HRD Authentication","feePaise":800,"timelineDays":2},{"step":"MEA Legalization","feePaise":700,"timelineDays":3},{"step":"Saudi Embassy Attestation","feePaise":2000,"timelineDays":6}]',1786600000),
('chain-uk-apostille','United Kingdom (Apostille) 🇬🇧','[{"step":"State HRD / SDM","feePaise":900,"timelineDays":3},{"step":"MEA Apostille","feePaise":900,"timelineDays":4}]',1786600000),
('chain-us-apostille','United States (Apostille) 🇺🇸','[{"step":"Notary","feePaise":500,"timelineDays":1},{"step":"State Secretary Authentication","feePaise":600,"timelineDays":3},{"step":"US Apostille (Federal)","feePaise":700,"timelineDays":4}]',1786600000);
--> statement-breakpoint
-- Umrah departures (real seat inventory)
INSERT OR IGNORE INTO `group_departures` (`id`,`package_tier`,`departure_date`,`capacity`,`booked_seats`,`price`,`booking_fee`,`status`,`created_at`) VALUES
('dep-aug-2026','standard',1786600000,30,12,12500000,1000000,'open',1786600000),
('dep-oct-2026','premium',1787200000,30,8,15000000,1200000,'open',1786600000),
('dep-nov-2026','economy',1787800000,30,5,8000000,500000,'open',1786600000);
