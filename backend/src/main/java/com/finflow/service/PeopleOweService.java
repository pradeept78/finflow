package com.finflow.service;
import com.finflow.entity.PeopleOwe;
import com.finflow.entity.User;
import com.finflow.repository.PeopleOweRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PeopleOweService {
    private final PeopleOweRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<PeopleOwe> getAll() { return repository.findByUserId(currentUser().getId()); }

    public PeopleOwe getById(Long id) {
        return repository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
    }

    public PeopleOwe create(PeopleOwe entity) { entity.setUser(currentUser()); return repository.save(entity); }

    public PeopleOwe update(Long id, PeopleOwe updated) {
        PeopleOwe existing = getById(id);
        updated.setId(existing.getId());
        updated.setUser(existing.getUser());
        return repository.save(updated);
    }

    public void delete(Long id) { repository.delete(getById(id)); }
}
