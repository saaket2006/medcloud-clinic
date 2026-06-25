package com.medcloud.clinic.controller;

import com.medcloud.clinic.model.Appointment;
import com.medcloud.clinic.model.User;
import com.medcloud.clinic.repository.UserRepository;
import com.medcloud.clinic.service.AppointmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/appointments")
@RequiredArgsConstructor
public class AppointmentController {

    private final AppointmentService appointmentService;
    private final UserRepository userRepository;

    @GetMapping("/my")
    public ResponseEntity<List<Appointment>> getMyAppointments(@AuthenticationPrincipal UserDetails userDetails) {
        User user = userRepository.findByEmail(userDetails.getUsername()).orElseThrow();
        if (user.getRole().name().equals("PATIENT")) {
            return ResponseEntity.ok(appointmentService.getAppointmentsForPatient(user));
        } else {
            return ResponseEntity.ok(appointmentService.getAppointmentsForDoctor(user));
        }
    }

    @PostMapping
    @PreAuthorize("hasRole('PATIENT')")
    public ResponseEntity<Appointment> createAppointment(@RequestBody Appointment appointment, @AuthenticationPrincipal UserDetails userDetails) {
        User user = userRepository.findByEmail(userDetails.getUsername()).orElseThrow();
        appointment.setPatient(user);
        return ResponseEntity.ok(appointmentService.createAppointment(appointment));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('PATIENT') or hasRole('ADMIN')")
    public ResponseEntity<Void> cancelAppointment(@PathVariable Long id) {
        appointmentService.deleteAppointment(id);
        return ResponseEntity.ok().build();
    }
}
