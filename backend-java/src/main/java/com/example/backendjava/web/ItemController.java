package com.example.backendjava.web;

import com.example.backendjava.model.Item;
import com.example.backendjava.service.ItemService;
import com.example.backendjava.web.dto.ItemCreateRequest;
import com.example.backendjava.web.dto.ItemUpdateRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ItemController {
    private final ItemService itemService;

    public ItemController(ItemService itemService) {
        this.itemService = itemService;
    }

    @GetMapping({"/items", "/api/items"})
    public List<Item> listItems() {
        return itemService.listActive();
    }

    @PostMapping({"/items", "/api/items"})
    public Item createItem(@Valid @RequestBody ItemCreateRequest body) {
        return itemService.create(body.getName());
    }

    @GetMapping({"/items/{id}", "/api/items/{id}"})
    public Item getItem(@PathVariable Long id) {
        return itemService.requireById(id);
    }

    @PutMapping({"/items/{id}", "/api/items/{id}"})
    public Item updateItem(@PathVariable Long id, @Valid @RequestBody ItemUpdateRequest body) {
        return itemService.update(id, body.getName());
    }

    @DeleteMapping({"/items/{id}", "/api/items/{id}"})
    public Map<String, Object> deleteItem(@PathVariable Long id) {
        itemService.softDelete(id);
        return Map.of("deleted", true, "id", id);
    }
}
