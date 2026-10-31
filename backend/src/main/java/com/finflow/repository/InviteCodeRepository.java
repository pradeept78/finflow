package com.finflow.repository;

import com.finflow.entity.InviteCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface InviteCodeRepository extends JpaRepository<InviteCode, Long> {
    List<InviteCode> findAllByOrderByCreatedAtDesc();

    boolean existsByCode(String code);

    /**
     * Marks an unused code as used in one UPDATE and returns how many rows changed (1 = claimed,
     * 0 = unknown or already used). A read-then-write would let two sign-ups race for the same code.
     */
    @Modifying
    @Query("UPDATE InviteCode i SET i.usedAt = :now, i.usedByEmail = :email WHERE i.code = :code AND i.usedAt IS NULL")
    int claim(@Param("code") String code, @Param("email") String email, @Param("now") LocalDateTime now);
}
