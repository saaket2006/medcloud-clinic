# MedCloud Clinic

A production-ready, cloud-enabled Hospital Management System (HMS) designed to digitize patient records, manage appointments, and streamline hospital operations. This project features a robust Spring Boot backend, a modern localized frontend, and a complete containerized deployment pipeline.

## 🌟 Branding & Localization
The system is fully localized for the Indian healthcare context, featuring:
- **Main Administrator**: Saaket Baldawa
- **Regional Context**: Healthcare facilities and providers localized to major Indian medical hubs (e.g., AIIMS Delhi, Apollo Hospitals).
- **Identity Management**: Integrated identity injection ensuring the owner's profile is reflected across all administrative touchpoints.

## 🛠️ Technology Stack
- **Frontend**: HTML5, Vanilla JavaScript, TailwindCSS (Modern, modular architecture).
- **Backend**: Java 17, Spring Boot 3.2.4 (Security, Data JPA, Hibernate, Validation).
- **Database**: 
  - **MySQL 8.0**: Production-ready persistent storage.
  - **H2**: In-memory database support for rapid local development/testing.
- **DevOps & Infrastructure**:
  - **Docker & Docker Compose**: Full-stack orchestration.
  - **Flyway**: Database version control and migrations.
  - **GitHub Actions**: Automated CI/CD pipeline for builds and testing.

## 📂 Project Structure
```text
medcloud-clinic/
├── backend/               # Spring Boot Application
│   ├── src/main/java/     # Core logic (Security, Controllers, Services)
│   ├── src/main/resources/# Configuration and Flyway migrations
│   └── Dockerfile         # Multi-stage production build
├── frontend/              # Localized User Interface
│   ├── js/                # app.js (API Integration), tailwind-config.js
│   ├── css/               # Modular styles.css
│   └── *.html             # Role-based dashboards (Admin, Doctor, Patient)
└── docker-compose.yml     # System-wide orchestration
```

## 🚀 Key Features
1.  **Role-Based Access Control (RBAC)**: Distinct, secure dashboards for Administrators, Doctors, and Patients.
2.  **Stateless Authentication**: Secure JWT-based login flow with persistent session management.
3.  **Appointment Management**: Automated scheduling and doctor availability tracking.
4.  **Electronic Medical Records (EMR)**: Digital dossiers for patient history and clinical notes.
5.  **Analytics & Monitoring**: Real-time hospital metrics and system audit logs.

## 💻 Getting Started

### Option 1: Full Stack (Docker - Recommended)
The fastest way to run the entire system (Backend + Database) is via Docker Compose:
1. Ensure Docker is running on your system.
2. Run the following command in the root directory:
   ```
   docker-compose up --build
   ```
3. The Backend API will be available at `http://localhost:8081`.
4. Open `frontend/index.html` in your browser to start using the system.

### Option 2: Local Development
**Backend**:
1. Navigate to `/backend`.
2. Run `./mvnw spring-boot:run`. (Ensure you have a local MySQL or use the H2 profile).

**Frontend**:
1. Simply open `frontend/index.html` in any modern web browser.
2. Use the **Auth Portal** (`login.html`) to access the dynamic dashboards.

## 🔧 System Architecture Details
- **Security**: Managed by Spring Security with custom `JwtService` and `SecurityConfiguration`.
- **Error Handling**: `GlobalExceptionHandler` ensures consistent, readable JSON responses for all API errors.
- **Data Persistence**: Uses Spring Data JPA with `Role` enum differentiation for users and dedicated `Appointment` tracking.
- **Migration**: Flyway manages the `V1__Initial_Schema.sql` to ensure database consistency across environments.
