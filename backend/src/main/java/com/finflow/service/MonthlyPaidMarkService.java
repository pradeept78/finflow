package com.finflow.service;

import com.finflow.entity.MonthlyPaidMark;
import com.finflow.entity.User;
import com.finflow.repository.MonthlyPaidMarkRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MonthlyPaidMarkService {

    private final MonthlyPaidMarkRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    private String currentMonthYear() {
        return LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
    }

    public List<String> getMarkedItems() {
        return repository.findByUserIdAndMonthYear(currentUser().getId(), currentMonthYear())
                .stream().map(MonthlyPaidMark::getItemKey).collect(Collectors.toList());
    }

    @Transactional
    public boolean toggle(String itemKey) {
        User user = currentUser();
        String monthYear = currentMonthYear();
        if (repository.existsByUserIdAndItemKeyAndMonthYear(user.getId(), itemKey, monthYear)) {
            repository.deleteByUserIdAndItemKeyAndMonthYear(user.getId(), itemKey, monthYear);
            return false;
        } else {
            repository.save(MonthlyPaidMark.builder().user(user).itemKey(itemKey).monthYear(monthYear).build());
            return true;
        }
    }
}
