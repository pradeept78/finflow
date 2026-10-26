package com.finflow.service;

import com.finflow.entity.Loan;
import com.finflow.entity.User;
import com.finflow.repository.LoanRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final UserRepository userRepository;
    private final LoanRepository loanRepository;
    private final Optional<JavaMailSender> mailSender;

    @Value("${app.email.enabled:false}")
    private boolean emailEnabled;

    @Value("${app.email.days-before:2}")
    private int daysBefore;

    public void sendDueReminders() {
        if (!emailEnabled || mailSender.isEmpty()) {
            log.debug("Email notifications disabled — skipping");
            return;
        }

        int today = LocalDate.now().getDayOfMonth();
        int targetDay = today + daysBefore;

        List<User> users = userRepository.findAll();
        for (User user : users) {
            List<Loan> dueSoon = loanRepository.findByUserId(user.getId()).stream()
                    .filter(l -> l.getDueDay() != null && l.getDueDay() == targetDay && (l.getPending() != null && l.getPending() > 0))
                    .toList();

            if (!dueSoon.isEmpty()) {
                StringBuilder body = new StringBuilder();
                body.append("Hi ").append(user.getName()).append(",\n\n");
                body.append("You have EMIs due in ").append(daysBefore).append(" days:\n\n");
                dueSoon.forEach(l -> body.append("• ").append(l.getLender())
                        .append(" — ₹").append(l.getEmi()).append("\n"));
                body.append("\nLog in to FinFlow to mark them paid.\n");

                try {
                    SimpleMailMessage msg = new SimpleMailMessage();
                    msg.setTo(user.getEmail());
                    msg.setSubject("FinFlow — EMI due in " + daysBefore + " days");
                    msg.setText(body.toString());
                    mailSender.get().send(msg);
                    log.info("Reminder sent to {}", user.getEmail());
                } catch (Exception e) {
                    log.error("Failed to send email to {}: {}", user.getEmail(), e.getMessage());
                }
            }
        }
    }
}
