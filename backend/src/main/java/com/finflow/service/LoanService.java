package com.finflow.service;

import com.finflow.entity.Loan;
import com.finflow.entity.User;
import com.finflow.repository.LoanRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
public class LoanService {

    private final LoanRepository loanRepository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<Loan> getAll() {
        return loanRepository.findByUserId(currentUser().getId());
    }

    public Loan getById(Long id) {
        return loanRepository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Loan not found"));
    }

    public Loan create(Loan loan) {
        loan.setUser(currentUser());
        return loanRepository.save(loan);
    }

    public Loan update(Long id, Loan updated) {
        Loan existing = getById(id);
        existing.setLender(updated.getLender());
        existing.setLoanType(updated.getLoanType());
        existing.setAmount(updated.getAmount());
        existing.setEmi(updated.getEmi());
        existing.setTenure(updated.getTenure());
        existing.setDueDay(updated.getDueDay());
        existing.setMissedMonths(updated.getMissedMonths());
        existing.setInterestRate(updated.getInterestRate());
        existing.setPrincipalPaid(updated.getPrincipalPaid());
        existing.setPrepaidAmount(updated.getPrepaidAmount());
        existing.setPrepaidNote(updated.getPrepaidNote());
        existing.setCurrentValue(updated.getCurrentValue());
        existing.setStartDate(updated.getStartDate());
        existing.setEndDate(updated.getEndDate());
        existing.setNotes(updated.getNotes());
        existing.setDebitAccount(updated.getDebitAccount());
        existing.setProcessingFee(updated.getProcessingFee());
        // NOTE: paid/pending are calculated from startDate+tenure on frontend
        // We do NOT update them here to prevent stale DB values causing wrong calculations
        return loanRepository.save(existing);
    }

    public void delete(Long id) {
        Loan loan = getById(id);
        loanRepository.delete(loan);
    }
}
