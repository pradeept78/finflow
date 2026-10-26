package com.finflow.service;
import com.finflow.entity.Saving;
import com.finflow.entity.User;
import com.finflow.repository.SavingRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SavingService {
    private final SavingRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<Saving> getAll() { return repository.findByUserId(currentUser().getId()); }

    public Saving getById(Long id) {
        return repository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
    }

    public Saving create(Saving entity) { entity.setUser(currentUser()); return repository.save(entity); }

    public Saving update(Long id, Saving updated) {
        Saving existing = getById(id);
        updated.setId(existing.getId());
        updated.setUser(existing.getUser());
        return repository.save(updated);
    }

    public void delete(Long id) { repository.delete(getById(id)); }
}
