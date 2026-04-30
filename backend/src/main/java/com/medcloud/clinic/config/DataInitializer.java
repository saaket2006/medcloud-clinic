package com.medcloud.clinic.config;

import com.medcloud.clinic.model.Role;
import com.medcloud.clinic.model.User;
import com.medcloud.clinic.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @SuppressWarnings("null")
    public void run(String... args) {
        if (userRepository.count() == 0) {
            // Seed Admin
            userRepository.save(User.builder()
                    .fullName("Saaket Baldawa")
                    .email("saaket@medcloudclinic.com")
                    .password(passwordEncoder.encode("password123"))
                    .role(Role.ADMIN)
                    .build());

            // Seed Doctor
            userRepository.save(User.builder()
                    .fullName("Dr. Aryan Sharma")
                    .email("aryan@medcloudclinic.com")
                    .password(passwordEncoder.encode("password123"))
                    .role(Role.DOCTOR)
                    .build());

            // Seed Patient
            userRepository.save(User.builder()
                    .fullName("Ananya Kulkarni")
                    .email("ananya@medcloudclinic.com")
                    .password(passwordEncoder.encode("password123"))
                    .role(Role.PATIENT)
                    .build());
            
            System.out.println("Default users seeded: Admin (Saaket), Doctor (Aryan), Patient (Ananya)");
        }
    }
}
