package com.example.backendjava.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.example.backendjava.model.Item;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ItemMapper extends BaseMapper<Item> {}
