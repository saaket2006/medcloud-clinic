package com.medcloud.clinic.repository;

import com.medcloud.clinic.model.Appointment;
import com.medcloud.clinic.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AppointmentRepository extends JpaRepository<Appointment, Long> {
    List<Appointment> findByPatient(User patient);
    List<Appointment> findByDoctor(User doctor);
}
