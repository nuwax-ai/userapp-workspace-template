package com.example.backendjava.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.backendjava.mapper.ItemMapper;
import com.example.backendjava.model.Item;
import com.example.backendjava.service.BadRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 纯单元测试（Mock Mapper，不连 DB、不起 Spring 上下文），示范模板的测试写法。
 */
@ExtendWith(MockitoExtension.class)
class ItemServiceImplTest {

    @Mock
    private ItemMapper itemMapper;

    @InjectMocks
    private ItemServiceImpl service;

    @Test
    void create_trims_name_and_inserts() {
        when(itemMapper.insert(any(Item.class))).thenReturn(1);

        Item saved = service.create("  hello  ");

        ArgumentCaptor<Item> captor = ArgumentCaptor.forClass(Item.class);
        verify(itemMapper).insert(captor.capture());
        assertEquals("hello", captor.getValue().getName());
        assertEquals("hello", saved.getName());
    }

    @Test
    void create_rejects_blank_name() {
        assertThrows(BadRequestException.class, () -> service.create("   "));
        verifyNoInteractions(itemMapper);
    }
}
