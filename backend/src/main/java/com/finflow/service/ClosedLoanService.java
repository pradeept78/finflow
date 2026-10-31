package com.finflow.service;
import com.finflow.entity.ClosedLoan;
import com.finflow.entity.User;
import com.finflow.repository.ClosedLoanRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ClosedLoanService {
    private final ClosedLoanRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<ClosedLoan> getAll() { return repository.findByUserId(currentUser().getId()); }

    public ClosedLoan getById(Long id) {
        return repository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
    }

    public ClosedLoan create(ClosedLoan entity) { entity.setId(null); entity.setUser(currentUser()); return repository.save(entity); }

    public ClosedLoan update(Long id, ClosedLoan updated) {
        ClosedLoan existing = getById(id);
        updated.setId(existing.getId());
        updated.setUser(existing.getUser());
        return repository.save(updated);
    }

    public void delete(Long id) { repository.delete(getById(id)); }
}
