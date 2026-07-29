package com.example.backendjava.service;

import com.example.backendjava.model.Item;
import java.util.List;

/**
 * 业务 Service：不继承 MyBatis-Plus IService/CrudRepository。
 * 3.5.9+ 官方不再推荐在业务层混用通用 CRUD 基类，数据访问交给 Mapper。
 */
public interface ItemService {
    List<Item> listActive();

    Item requireById(Long id);

    Item create(String name);

    Item update(Long id, String name);

    void softDelete(Long id);
}
