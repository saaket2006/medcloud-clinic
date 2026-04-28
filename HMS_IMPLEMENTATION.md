# HMS Implementation Architecture

This document summarizes the full-stack implementation of the Cloud-Enabled Hospital Management System.

## Technology Stack
- **Frontend**: HTML5, Vanilla JavaScript, TailwindCSS (for rapid premium styling).
- **Backend**: Java 17, Spring Boot 3.2.4 (Security, JPA, Validation).
- **Database**: H2 (In-memory for demo) / MySQL 8.0 (Production-ready in Docker).
- **DevOps**: Docker, Docker Compose, GitHub Actions.

## Backend Components (Backend Agent)
- `AuthController`: Manages user registration and role-based login.
- `JwtService`: Handles stateless token administration.
- `SecurityConfiguration`: Enforces access control (RBAC).
- `GlobalExceptionHandler`: Ensures clean JSON error messages.

## Data & Persistence (Data Agent)
- `User` entity: Differentiates roles via `Role` enum (PATIENT, DOCTOR, ADMIN).
- `Appointment` entity: Manages clinic schedules.
- `pom.xml`: Includes H2, MySQL, and JWT dependencies.

## Deployment & Quality (Quality Agent)
- `Dockerfile`: Multi-stage build for efficient Go-OpenSDK runtime.
- `docker-compose.yml`: Full-stack orchestration.
- `main.yml`: Automated CI/CD for branch pushes.

## Integration (Frontend Agent)
- Updated `login.html` to authenticate against session-based JWT tokens.
- Persistent session storage in `localStorage`.
