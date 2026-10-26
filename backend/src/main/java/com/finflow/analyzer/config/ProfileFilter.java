package com.finflow.analyzer.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Reads the X-Profile header (or ?profile= param) into ProfileContext for each request, plus
 * X-From/X-To into DateRangeContext. Ported unchanged from the standalone Statement Analyzer app —
 * real request authentication is handled separately by Spring Security's JwtAuthFilter; this filter
 * only ever set the optional sub-label/date-range, never identity, so the merge doesn't touch it.
 */
@Component
@Order(1)
public class ProfileFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        try {
            HttpServletRequest http = (HttpServletRequest) req;
            String profile = http.getHeader("X-Profile");
            if (profile == null || profile.isBlank()) profile = http.getParameter("profile");
            ProfileContext.set(profile);
            DateRangeContext.set(http.getHeader("X-From"), http.getHeader("X-To"));
            chain.doFilter(req, res);
        } finally {
            ProfileContext.clear();
            DateRangeContext.clear();
        }
    }
}
