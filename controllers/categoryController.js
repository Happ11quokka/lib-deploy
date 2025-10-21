const db = require("../config/db");

const getCategoriesPage = async (req, res, next) => {
  try {
    /*
            TODO: 모든 카테고리를 출력하는 페이지를 렌더링하는 코드를 작성하세요.
        */
    const [categories] = await db.query(
      `SELECT category_id as id, category_name as name 
             FROM Category 
             ORDER BY category_name`
    );

    res.render("pages/categories", {
      title: "Category Management",
      categories: categories,
    });
  } catch (err) {
    next(err);
  }
};

const postDeleteCategory = async (req, res, next) => {
  const categoryId = Number(req.params.id);

  const connection = await db.pool.getConnection();

  try {
    /*
            TODO: 카테고리를 제거하는 코드를 작성하세요.
            만약 해당 카테고리에 포함된 책이 있다면 책에서 해당 카테고리만 지우고 나머지 카테고리는 유지하면 됩니다.
        */
    await connection.beginTransaction();

    // 1. 카테고리 존재 확인
    const [categoryExists] = await connection.query(
      `SELECT category_id FROM Category WHERE category_id = ?`,
      [categoryId]
    );

    if (categoryExists.length === 0) {
      await connection.rollback();
      const err = new Error("Category not found.");
      err.status = 404;
      return next(err);
    }

    // 2. 카테고리 삭제 (BookCategory는 ON DELETE CASCADE로 자동 삭제됨)
    await connection.query(`DELETE FROM Category WHERE category_id = ?`, [
      categoryId,
    ]);

    await connection.commit();
    res.redirect("/categories");
  } catch (err) {
    await connection.rollback();
    return next(err);
  } finally {
    connection.release();
  }
};

module.exports = {
  getCategoriesPage,
  postDeleteCategory,
};
