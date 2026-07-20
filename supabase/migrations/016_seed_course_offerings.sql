-- Run this in Supabase SQL Editor, AFTER the course_offerings table exists.

insert into course_offerings
  (subject_code, subject_title, instructor_name, section, year_level, days, start_time, end_time, room, type)
values
  ('ATF 111', 'Theory of Flight', 'Tirol, James Bennett', 'AT 1st Year Block B', '1st Year', '{1,3,5}', '13:00', '14:00', 'S201', 'Lecture'),
  ('ATF 112', 'Basic Aircraft Instruments', 'Sagarino, Mae', 'AT 1st Year Block A', '1st Year', '{1,3,5}', '09:00', '10:00', 'S201', 'Lecture'),
  ('ATF 112', 'Basic Aircraft Instruments', 'Sagarino, Mae', 'AT 1st Year Block B', '1st Year', '{1,3,5}', '14:00', '15:00', 'S201', 'Lecture'),
  ('ATF 211', 'A/C Performance', 'Sevilla, Zion Becker A.', 'AT 2nd Year Block A', '2nd Year', '{1,3,5}', '09:00', '10:00', 'S202', 'Lecture'),
  ('ATF 111', 'Theory of Flight', 'Alob, Raymound John B.', 'AT 1st Year Block A', '1st Year', '{1,3,5}', '08:00', '09:00', 'S201', 'Lecture'),
  ('ATF 113', 'ATC Procedures/Radio Comms', 'Juaton, Jinus Meigs', 'AT 1st Year Block A', '1st Year', '{1,3,5}', '11:00', '12:00', 'S201', 'Lecture'),
  ('ATF 113', 'ATC Procedures/Radio Comms', 'Juaton, Jinus Meigs', 'AT 1st Year Block B', '1st Year', '{1,3,5}', '15:00', '16:00', 'S201', 'Lecture'),
  ('ATF 211', 'A/C Performance', 'Sevilla, Zion Becker A.', 'AT 2nd Year Block B', '2nd Year', '{1,3,5}', '08:00', '09:00', 'S202', 'Lecture'),
  ('ATF 212', 'Aviation Meteorology', 'Blanco, Kent Benedict T.', 'AT 2nd Year Block A', '2nd Year', '{2,4}', '08:00', '10:00', 'S202', 'Lecture'),
  ('ATF 212', 'Aviation Meteorology', 'Blanco, Kent Benedict T.', 'AT 2nd Year Block B', '2nd Year', '{2,4}', '10:00', '12:00', 'S202', 'Lecture'),
  ('ATF 311', 'Aircraft Propellers', 'Sagarino, Mae', 'AT 3rd Year Block A', '3rd Year', '{1,3}', '15:00', '16:00', 'S203', 'Lecture'),
  ('ATF 311', 'Aircraft Propellers', 'Zafico, Justine Roi L.', 'AT 3rd Year Block B', '3rd Year', '{1,3}', '09:00', '10:00', 'S203', 'Lecture'),
  ('ATF 313', 'Advanced ATC Flight Environment', 'Zafico, Justine Roi L.', 'AT 3rd Year Block B', '3rd Year', '{1,3,5}', '13:00', '14:00', 'S203', 'Lecture'),
  ('ATF 410', 'A/C Systems', 'Adaptar, Adriane Joseph B.', 'AT 4th Year Block A', '4th Year', '{1,3}', '11:00', '12:00', 'S203', 'Lecture'),
  ('ATF 413', 'IFR Considerations', 'Ladica, Kimmy Pearl C.', 'AT 4th Year Block A', '4th Year', '{2,4}', '11:00', '13:00', 'S203', 'Lecture'),
  ('ATF 413', 'IFR Considerations', 'Ladica, Kimmy Pearl C.', 'AT 4th Year Block B', '4th Year', '{2,4}', '13:00', '15:00', 'S201', 'Lecture'),
  ('ATF 414', 'A/C Materials, Constr & Repair- Metals', 'Cadavos, Kenneth A.', null, '4th Year', '{1,3}', '13:00', '14:00', 'S202', 'Lecture'),
  ('ATF 414', 'A/C Materials, Constr & Repair- Metals', 'Cadavos, Kenneth A.', null, '4th Year', '{2,4}', '08:00', '11:00', 'Machining Lab', 'Laboratory'),
  ('ATF 412', 'Pilot Instructor Rating 1 ELEC', 'Illustrisimo, Flordeliza B.', 'AT 4th Year Block A', '4th Year', '{2,4}', '15:00', '17:00', 'S201', 'Lecture'),
  ('ATF 411', 'Multi-Engine Concepts', 'Quiaoit, Keone V.', 'AT 4th Year Block B', '4th Year', '{2,4}', '16:30', '18:00', 'S202', 'Lecture'),
  ('ATF 411', 'Multi-Engine Concepts', 'Quiaoit, Keone V.', 'AT 4th Year Block A', '4th Year', '{1,3,5}', '17:00', '18:00', 'S202', 'Lecture'),
  ('ATF 415', 'Flight Operations Officer 1 ELEC', 'Villaceran, Mc Kenzie I.', 'AT 4th Year Block B', '4th Year', '{1,2,3,4,5}', '18:00', '21:00', 'S204', 'Lecture&Lab'),
  ('ATF 313', 'Advanced ATC Flight Environment', 'Zafico, Justine Roi L.', 'AT 3rd Year Block A', '3rd Year', '{1,3,5}', '08:00', '09:00', 'S203', 'Lecture'),
  ('ATF 312', 'Aircraft Fuels and Lubricants', 'Alob, Raymound John B.', 'AT 3rd Year Block B', '3rd Year', '{2,4}', '08:00', '09:30', 'S203', 'Lecture'),
  ('ATF 312', 'Aircraft Fuels and Lubricants', 'Zafico, Justine Roi L.', 'AT 3rd Year Block A', '3rd Year', '{2,4}', '09:30', '11:00', 'S203', 'Lecture');
