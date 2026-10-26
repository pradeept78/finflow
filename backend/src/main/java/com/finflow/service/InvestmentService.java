package com.finflow.service;
import com.finflow.entity.Investment;
import com.finflow.entity.User;
import com.finflow.repository.InvestmentRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class InvestmentService {
    private final InvestmentRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<Investment> getAll() { return repository.findByUserId(currentUser().getId()); }

    public Investment getById(Long id) {
        return repository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
    }

    public Investment create(Investment entity) { entity.setUser(currentUser()); return repository.save(entity); }

    public Investment update(Long id, Investment updated) {
        Investment existing = getById(id);
        updated.setId(existing.getId());
        updated.setUser(existing.getUser());
        return repository.save(updated);
    }

    public void delete(Long id) { repository.delete(getById(id)); }
}
