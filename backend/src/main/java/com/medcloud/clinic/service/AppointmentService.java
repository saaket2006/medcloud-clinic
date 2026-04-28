package com.medcloud.clinic.service;

import com.medcloud.clinic.model.Appointment;
import com.medcloud.clinic.model.User;
import com.medcloud.clinic.repository.AppointmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AppointmentService {
    private final AppointmentRepository repository;

    public List<Appointment> getAppointmentsForPatient(User patient) {
        return repository.findByPatient(patient);
    }

    public List<Appointment> getAppointmentsForDoctor(User doctor) {
        return repository.findByDoctor(doctor);
    }

    public Appointment createAppointment(Appointment appointment) {
        return repository.save(appointment);
    }
}
