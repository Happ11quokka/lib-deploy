const db = require("../config/db");

const getChartsPage = async (req, res, next) => {
  const rawCategoryId = req.query.categoryId;
  let selectedCategoryId =
    typeof rawCategoryId !== "undefined" && rawCategoryId !== ""
      ? Number(rawCategoryId)
      : null;

  if (selectedCategoryId !== null && Number.isNaN(selectedCategoryId)) {
    selectedCategoryId = null;
  }

  try {
    /*
            TODO: 차트 페이지를 렌더링하는 코드를 작성하세요.
        */

    // 1. 카테고리 목록 조회
    const [categories] = await db.query(
      `SELECT category_id as id, category_name as name 
             FROM Category 
             ORDER BY category_name`
    );

    if (!selectedCategoryId && categories.length > 0) {
      selectedCategoryId = categories[0].id;
    }

    // 2. 전체 인기 도서 조회 (최근 3개월 기준)
    const [popularBooks] = await db.query(
      `SELECT 
                b.title,
                a.author_name as author,
                GROUP_CONCAT(DISTINCT c.category_name SEPARATOR ', ') as categories,
                COUNT(br.record_id) as borrow_count
            FROM Book b
            LEFT JOIN Author a ON b.author_id = a.author_id
            LEFT JOIN BookCategory bcat ON b.book_id = bcat.book_id
            LEFT JOIN Category c ON bcat.category_id = c.category_id
            LEFT JOIN BorrowRecord br ON b.book_id = br.book_id
                AND br.borrow_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
            GROUP BY b.book_id, b.title, a.author_name
            HAVING borrow_count > 0
            ORDER BY borrow_count DESC, b.title ASC
            LIMIT 10`
    );

    // 3. 카테고리별 인기 도서 조회
    const popularBooksByCategory = {};
    let selectedCategoryName = null;

    if (selectedCategoryId) {
      const [selectedCategory] = await db.query(
        `SELECT category_name as name FROM Category WHERE category_id = ?`,
        [selectedCategoryId]
      );

      if (selectedCategory.length > 0) {
        selectedCategoryName = selectedCategory[0].name;

        const [categoryBooks] = await db.query(
          `SELECT 
            b.title,
            a.author_name as author,
            GROUP_CONCAT(DISTINCT c.category_name SEPARATOR ', ') as categories,
            COUNT(br.record_id) as borrow_count
          FROM Book b
          LEFT JOIN Author a ON b.author_id = a.author_id
          LEFT JOIN BookCategory bcat ON b.book_id = bcat.book_id
          LEFT JOIN Category c ON bcat.category_id = c.category_id
          LEFT JOIN BorrowRecord br ON b.book_id = br.book_id
            AND br.borrow_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
          WHERE b.book_id IN (
            SELECT book_id FROM BookCategory WHERE category_id = ?
          )
          GROUP BY b.book_id, b.title, a.author_name
          HAVING borrow_count > 0
          ORDER BY borrow_count DESC, b.title ASC
          LIMIT 10`,
          [selectedCategoryId]
        );

        popularBooksByCategory[selectedCategoryName] = categoryBooks;
      }
    }

    res.render("pages/charts", {
      title: "Charts",
      popularBooks: popularBooks,
      popularBooksByCategory: popularBooksByCategory,
      categories: categories,
      selectedCategoryId,
      selectedCategoryName,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getChartsPage,
};
