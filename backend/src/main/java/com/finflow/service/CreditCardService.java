package com.finflow.service;
import com.finflow.entity.CardEmi;
import com.finflow.entity.CardSpend;
import com.finflow.entity.CreditCard;
import com.finflow.entity.User;
import com.finflow.repository.CreditCardRepository;
import com.finflow.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CreditCardService {
    private final CreditCardRepository repository;
    private final UserRepository userRepository;

    private User currentUser() {
        String email = SecurityContextHolder.getContext().getAuthentication().getName();
        return userRepository.findByEmail(email).orElseThrow(() -> new RuntimeException("User not found"));
    }

    public List<CreditCard> getAll() { return repository.findByUserId(currentUser().getId()); }

    public CreditCard getById(Long id) {
        return repository.findByIdAndUserId(id, currentUser().getId())
                .orElseThrow(() -> new RuntimeException("Not found"));
    }

    public CreditCard create(CreditCard entity) { entity.setUser(currentUser()); return repository.save(entity); }

    public CreditCard update(Long id, CreditCard updated) {
        CreditCard existing = getById(id);
        updated.setId(existing.getId());
        updated.setUser(existing.getUser());
        // Set card reference on all EMIs and spends to prevent null card_id
        if (updated.getEmis() != null) updated.getEmis().forEach(e -> e.setCard(updated));
        if (updated.getSpends() != null) updated.getSpends().forEach(s -> s.setCard(updated));
        return repository.save(updated);
    }

    @Transactional
    public CreditCard markEmiPaid(Long cardId, Long emiId) {
        CreditCard card = getById(cardId);
        CardEmi emi = card.getEmis().stream()
                .filter(e -> e.getId().equals(emiId))
                .findFirst()
                .orElseThrow(() -> new RuntimeException("EMI not found"));
        int pending = emi.getPending() == null ? 0 : emi.getPending();
        int paid = emi.getPaid() == null ? 0 : emi.getPaid();
        if (pending > 0) {
            emi.setPending(pending - 1);
            emi.setPaid(paid + 1);
        }
        return repository.save(card);
    }

    @Transactional
    public CreditCard addEmi(Long cardId, CardEmi emi) {
        CreditCard card = getById(cardId);
        emi.setCard(card);
        card.getEmis().add(emi);
        return repository.save(card);
    }

    @Transactional
    public CreditCard addSpend(Long cardId, CardSpend spend) {
        CreditCard card = getById(cardId);
        spend.setCard(card);
        card.getSpends().add(spend);
        return repository.save(card);
    }

    public void delete(Long id) { repository.delete(getById(id)); }
}
