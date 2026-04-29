package com.medcloud.clinic.security;

import com.medcloud.clinic.dto.AuthenticationRequest;
import com.medcloud.clinic.dto.AuthenticationResponse;
import com.medcloud.clinic.dto.RegisterRequest;
import com.medcloud.clinic.exception.UserAlreadyExistsException;
import com.medcloud.clinic.model.User;
import com.medcloud.clinic.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Collections;

@Service
@RequiredArgsConstructor
public class AuthenticationService {

    private final UserRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public AuthenticationResponse register(RegisterRequest request) {
        if (repository.existsByEmail(request.getEmail())) {
            throw new UserAlreadyExistsException("User with email " + request.getEmail() + " already exists");
        }
        var user = User.builder()
                .fullName(request.getFullName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(request.getRole())
                .build();
        repository.save(java.util.Objects.requireNonNull(user));
        
        var userDetails = new org.springframework.security.core.userdetails.User(
                    user.getEmail(),
                    user.getPassword(),
                    Collections.singletonList(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
                );
        var jwtToken = jwtService.generateToken(userDetails);
        return AuthenticationResponse.builder()
                .token(jwtToken)
                .role(user.getRole().name())
                .build();
    }

    public AuthenticationResponse authenticate(AuthenticationRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getEmail(),
                        request.getPassword()
                )
        );
        var user = repository.findByEmail(request.getEmail())
                .orElseThrow();
        var userDetails = new org.springframework.security.core.userdetails.User(
                    user.getEmail(),
                    user.getPassword(),
                    Collections.singletonList(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
                );
        var jwtToken = jwtService.generateToken(userDetails);
        return AuthenticationResponse.builder()
                .token(jwtToken)
                .role(user.getRole().name())
                .build();
    }
}
