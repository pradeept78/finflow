package com.finflow.service;
import com.finflow.entity.PersonalEmi;
import com.finflow.entity.User;
import com.finflow.repository.PersonalEmiRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PersonalEmiService {
    private final PersonalEmiRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<PersonalEmi> getAll() { return repository.findByUserId(currentUser().getId()); }

    public PersonalEmi getById(Long id) {
        return repository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
    }

    public PersonalEmi create(PersonalEmi entity) { entity.setUser(currentUser()); return repository.save(entity); }

    public PersonalEmi update(Long id, PersonalEmi updated) {
        PersonalEmi existing = getById(id);
        updated.setId(existing.getId());
        updated.setUser(existing.getUser());
        return repository.save(updated);
    }

    public void delete(Long id) { repository.delete(getById(id)); }
}
