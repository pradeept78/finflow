package com.finflow.scheduler;

import com.finflow.service.SnapshotService;
import com.finflow.service.NotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class MonthlyScheduler {

    private final SnapshotService snapshotService;
    private final NotificationService notificationService;

    // Run on 1st of every month at 1:00 AM
    @Scheduled(cron = "0 0 1 1 * *")
    public void takeMonthlySnapshot() {
        log.info("Running monthly snapshot job...");
        snapshotService.generateSnapshotsForAllUsers();
    }

    // Run daily at 8:00 AM — send due reminders
    @Scheduled(cron = "0 0 8 * * *")
    public void sendDueReminders() {
        log.info("Running daily due reminder job...");
        notificationService.sendDueReminders();
    }
}
