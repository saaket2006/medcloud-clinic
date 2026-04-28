CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL
);

CREATE TABLE appointments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    doctor_id BIGINT NOT NULL,
    date_time DATETIME NOT NULL,
    status VARCHAR(50) NOT NULL,
    reason VARCHAR(255),
    CONSTRAINT fk_appointment_patient FOREIGN KEY (patient_id) REFERENCES users(id),
    CONSTRAINT fk_appointment_doctor FOREIGN KEY (doctor_id) REFERENCES users(id)
);
