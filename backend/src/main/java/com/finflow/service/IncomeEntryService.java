package com.finflow.service;
import com.finflow.entity.IncomeEntry;
import com.finflow.entity.User;
import com.finflow.repository.IncomeEntryRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class IncomeEntryService {
    private final IncomeEntryRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<IncomeEntry> getAll() { return repository.findByUserId(currentUser().getId()); }

    public IncomeEntry getById(Long id) {
        return repository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
    }

    public IncomeEntry create(IncomeEntry entity) { entity.setId(null); entity.setUser(currentUser()); return repository.save(entity); }

    public IncomeEntry update(Long id, IncomeEntry updated) {
        IncomeEntry existing = getById(id);
        updated.setId(existing.getId());
        updated.setUser(existing.getUser());
        return repository.save(updated);
    }

    public void delete(Long id) { repository.delete(getById(id)); }
}
