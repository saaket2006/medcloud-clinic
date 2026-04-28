# MedCloud Clinic

A cloud-enabled Hospital Management System that digitizes patient records, appointments, and hospital operations with automated build, testing, and deployment.

## Recent Updates (Frontend Architecture Refactor)

The frontend application has been fully refactored from a monolithic HTML structure into a maintainable, modular, and performant architecture:

*   **Modular Architecture**: Fully segregated static HTML pages, Cascading Style Sheets (`css/styles.css`), and JavaScript behaviors (`js/app.js`, `js/tailwind-config.js`). Native HTML links connect the pieces cleanly without complex build systems.
*   **Structural Integrity**: Verified and standardized `<head>` tags and meta configurations across all key dashboard pages ensuring layout stability and performance (including `doctor-dashboard.html`, `appointment-booking.html`, `edit-profile.html`, etc.).
*   **Protected Dashboard Routes**: Added client-side mock authentication logic inside `js/app.js` guaranteeing that "No navigation is allowed to dashboard endpoints until a user explicitly logs in."
*   **Consistent Navigation**: Fully interconnected layouts. The "Clinical Atelier" title acts as a global brand link that directly redirects to the main landing view (`index.html`).
*   **Tailwind Standardization**: Extracted inline configuration tags previously embedded directly within the HTML to global configuration files, drastically reducing the overall frontend code footprint.

## Project Structure

```text
medcloud-clinic/
└── frontend/
    ├── css/
    │   └── styles.css          # Extracted global styles and custom utility classes
    ├── js/
    │   ├── app.js              # State logic, user login constraints, API integration mocks
    │   └── tailwind-config.js  # Global Tailwind configuration 
    ├── index.html              # Landing Page
    ├── login.html              # Auth Portal
    ├── admin-dashboard.html    # Administrative overview
    ├── patient-dashboard.html  # Patient-facing features
    ├── doctor-dashboard.html   # Doctor access and schedule 
    ├── appointment-booking.html
    ├── medical-records.html
    ├── analytics.html
    └── edit-profile.html       # Profile and identity management
```

## Features

1.  **Role-Based Dashboards**: Segmented data visibility explicitly dedicated for Administrators, Doctors, and Patients.
2.  **Modular Stylings**: Clean, highly performant UI relying on Tailwind CSS and Google Fonts (Manrope, Inter).
3.  **Modern UI/UX**: Implements a highly accessible design scheme adhering to modern user behavior patterns (Responsive containers, unified sidebar navigation).
4.  **Static Execution Flow**: Easily adaptable to immediate deployment upon CDN platforms (Vercel, Netlify) directly out of the box because no complex bundling engines are inherently required to display the UI correctly.

## Setup Instructions

1.  Clone this repository to your local machine.
2.  In the `frontend/` directory, simply open `index.html` in your web browser.
3.  Proceed to the "Login" flow to gain simulated access to the remaining dynamic dashboard components.

## Target Integrations
*(Future Scope)*
- Expand `js/app.js` with functional `fetch()` APIs calling robust, containerized Node.js/Python server clusters.
- Store real session JSON Web Tokens (JWT) upon successful authentication in cookies/local storage.
