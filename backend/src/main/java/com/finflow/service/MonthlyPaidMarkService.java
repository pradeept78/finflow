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

    /** A "yyyy-MM" the caller asked for, else the current month. Lets a bill due next month (a card statement
     *  generated this month) be ticked now and still read as paid once that month starts. */
    private String monthOrCurrent(String monthYear) {
        return monthYear != null && monthYear.matches("\\d{4}-(0[1-9]|1[0-2])") ? monthYear : currentMonthYear();
    }

    public List<String> getMarkedItems() { return getMarkedItems(null); }

    public List<String> getMarkedItems(String monthYear) {
        return repository.findByUserIdAndMonthYear(currentUser().getId(), monthOrCurrent(monthYear))
                .stream().map(MonthlyPaidMark::getItemKey).collect(Collectors.toList());
    }

    @Transactional
    public boolean toggle(String itemKey) { return toggle(itemKey, null); }

    @Transactional
    public boolean toggle(String itemKey, String requestedMonth) {
        User user = currentUser();
        String monthYear = monthOrCurrent(requestedMonth);
        if (repository.existsByUserIdAndItemKeyAndMonthYear(user.getId(), itemKey, monthYear)) {
            repository.deleteByUserIdAndItemKeyAndMonthYear(user.getId(), itemKey, monthYear);
            return false;
        } else {
            repository.save(MonthlyPaidMark.builder().user(user).itemKey(itemKey).monthYear(monthYear).build());
            return true;
        }
    }
}
