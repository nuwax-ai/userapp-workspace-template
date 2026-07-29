package com.example.backendjava.web.dto;

import jakarta.validation.constraints.NotBlank;

public class ItemCreateRequest {
    @NotBlank(message = "name is required")
    private String name;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
