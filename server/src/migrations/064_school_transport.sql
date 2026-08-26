-- ============================================================
-- Bizness-OS: School Management — Phase 7 (Transport Management)
--
--   - transport_vehicles: the physical buses/vans, each with a real
--     seating capacity and an assigned driver (a regular employee, the
--     same as every other staff member in this system).
--   - transport_routes: a named route, tied to one vehicle.
--   - transport_stops: the pickup points along a route, in sequence,
--     each with its own pickup time — a route is a sequence of stops,
--     not just a single pickup point.
--   - student_transport_assignments: which student rides which route,
--     picked up at which stop. Capacity is enforced at assignment time
--     — a vehicle can't be assigned more actively-riding students than
--     its seating capacity — the same "don't let the data go somewhere
--     physically impossible" discipline as the timetable's teacher
--     double-booking guard.
-- ============================================================

CREATE TABLE transport_vehicles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  registration_no   VARCHAR(30) NOT NULL,
  capacity          INTEGER NOT NULL CHECK (capacity > 0),
  driver_id         UUID REFERENCES employees(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, registration_no)
);

CREATE INDEX idx_transport_vehicles_company ON transport_vehicles(company_id);

CREATE TABLE transport_routes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  vehicle_id    UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transport_routes_company ON transport_routes(company_id);

CREATE TABLE transport_stops (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id        UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  stop_name       VARCHAR(150) NOT NULL,
  sequence_order  INTEGER NOT NULL DEFAULT 0,
  pickup_time     TIME
);

CREATE INDEX idx_transport_stops_route ON transport_stops(route_id, sequence_order);

CREATE TABLE student_transport_assignments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  route_id      UUID NOT NULL REFERENCES transport_routes(id),
  stop_id       UUID REFERENCES transport_stops(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, route_id)
);

CREATE INDEX idx_student_transport_company ON student_transport_assignments(company_id);
CREATE INDEX idx_student_transport_route ON student_transport_assignments(route_id, is_active);

-- Reuses the existing school.view / school.manage permissions — same
-- module, no new permission needed.
