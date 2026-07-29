package com.example.backendjava.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.example.backendjava.mapper.ItemMapper;
import com.example.backendjava.model.Item;
import com.example.backendjava.service.BadRequestException;
import com.example.backendjava.service.ItemService;
import com.example.backendjava.service.NotFoundException;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ItemServiceImpl implements ItemService {
    private final ItemMapper itemMapper;

    public ItemServiceImpl(ItemMapper itemMapper) {
        this.itemMapper = itemMapper;
    }

    @Override
    public List<Item> listActive() {
        return itemMapper.selectList(new LambdaQueryWrapper<Item>().orderByAsc(Item::getId));
    }

    @Override
    public Item requireById(Long id) {
        Item item = itemMapper.selectById(id);
        if (item == null) {
            throw new NotFoundException("item not found");
        }
        return item;
    }

    @Override
    public Item create(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new BadRequestException("name is required");
        }
        Item item = new Item(trimmed);
        itemMapper.insert(item);
        return item;
    }

    @Override
    public Item update(Long id, String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new BadRequestException("name is required");
        }
        Item item = requireById(id);
        item.setName(trimmed);
        itemMapper.updateById(item);
        return item;
    }

    @Override
    public void softDelete(Long id) {
        if (itemMapper.deleteById(id) == 0) {
            throw new NotFoundException("item not found");
        }
    }
}
