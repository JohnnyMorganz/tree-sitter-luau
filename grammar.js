const PREC = {
  FUNCTION: 1,

  OR: 2,
  AND: 3,
  COMPARE: 4,
  CONCAT: 5,
  ADD: 6,
  MULTI: 7,
  UNARY: 8,
  EXP: 9,
};

module.exports = grammar({
  name: "luau",

  // External scanners to handle complex rules
  externals: ($) => [$._multiline_comment, $.string],

  // Tokens which can appear anywhere in the language.
  extras: ($) => [/[\n]/, /\s/, $.comment],

  rules: {
    program: ($) => $._block,

    _statement: ($) =>
      choice(
        $.variable_declaration,
        // $.function_call,
        $.do_statement,
        $.while_statement,
        $.repeat_statement,
        $.if_statement,
        $.numeric_for_statement,
        $.generic_for_statement,
        $.function_declaration,
        $.local_function_declaration,
        $.local_assignment
      ),

    _last_statement: ($) =>
      choice($.return_statement, $.break_statement, $.continue_statement),

    _chunk: ($) =>
      choice(
        seq(
          repeat1(seq($._statement, optional(";"))),
          optional(seq($._last_statement, optional(";")))
        ),
        $._last_statement
      ),

    _block: ($) => $._chunk,

    // Statements
    variable_declaration: ($) =>
      seq(
        field("variables", list_of($._var, ",", false)),
        "=",
        field("expressions", list_of($._expression, ",", false))
      ),
    do_statement: ($) => seq("do", optional($._block), "end"),

    while_statement: ($) =>
      seq("while", $._expression, "do", optional($._block), "end"),

    repeat_statement: ($) =>
      seq("repeat", optional($._block), "until", $._expression),

    if_statement: ($) =>
      seq(
        "if",
        $._expression,
        "then",
        $._block,
        repeat($.else_if_statement),
        optional($.else_statement),
        "end"
      ),
    else_if_statement: ($) => seq("elseif", $._expression, "then", $._block),
    else_statement: ($) => seq("else", $._block),

    numeric_for_statement: ($) =>
      seq(
        "for",
        field("var", $.identifier),
        "=",
        field("start", $._expression),
        ",",
        field("end", $._expression),
        optional(seq(",", field("step", $._expression))),
        "do",
        optional($._block),
        "end"
      ),

    generic_for_statement: ($) =>
      seq(
        "for",
        field("names", list_of($.identifier, ",", false)),
        "in",
        field("expressions", list_of($._expression, ",", false)),
        "do",
        optional($._block),
        "end"
      ),

    function_declaration: ($) =>
      seq("function", $.function_name, $._function_body),

    function_name: ($) =>
      seq(list_of($.identifier, ".", false), optional(seq(":", $.identifier))),

    local_function_declaration: ($) =>
      seq("local", "function", $.identifier, $._function_body),

    local_assignment: ($) =>
      seq(
        "local",
        field("names", list_of($.identifier, ",", false)),
        "=",
        list_of($._expression, ",", false)
      ),

    return_statement: ($) =>
      seq("return", optional(list_of($._expression, ","))),

    break_statement: ($) => "break",
    continue_statement: ($) => "continue",

    // Building blocks
    _var: ($) =>
      choice(
        $.identifier,
        seq($.prefix_exp, "[", $._expression, "]"),
        seq($.prefix_exp, ".", $.identifier)
      ),

    prefix_exp: ($) =>
      choice(
        $._var,
        $.function_call,
        seq($.left_paren, $._expression, $.right_paren)
      ),

    // Expressions
    _expression: ($) =>
      choice(
        $.nil,
        $.boolean,
        $.number,
        $.string,
        $.ellipse,
        $.anonymous_function,
        $.prefix_exp,
        $.table_constructor,
        $.binary_expression,
        $.unary_expression
      ),

    anonymous_function: ($) => seq("function", $._function_body),
    _function_body: ($) =>
      seq(
        $.left_paren,
        optional($.parameter_list),
        $.right_paren,
        alias($._block, $.function_block),
        "end"
      ),

    parameter_list: ($) =>
      choice(
        seq(list_of($.identifier, ",", false), optional(seq(",", $.ellipse))),
        $.ellipse
      ),

    // Table
    table_constructor: ($) => seq("{", optional($.table_fields), "}"),
    table_fields: ($) => list_of($.field, $.field_separator, true),
    _named_field_expression: ($) =>
      seq(field("name", $.identifier), "=", field("value", $._expression)),
    _expression_field_expression: ($) =>
      seq(
        "[",
        field("key", $._expression),
        "]",
        "=",
        field("value", $._expression)
      ),

    field: ($) =>
      choice(
        $._named_field_expression,
        $._expression_field_expression,
        field("value", $._expression)
      ),
    field_separator: ($) => choice(",", ";"),

    // Function Call
    function_call: ($) =>
      prec.right(
        PREC.FUNCTION,
        seq($.prefix_exp, choice($._args, $._method_call))
      ),

    _method_call: ($) => seq(":", $.identifier, $._args),
    _args: ($) =>
      choice(
        seq(
          $.left_paren,
          field("args", optional($.function_arguments)),
          $.right_paren
        ),
        field("args", $.table_constructor),
        field("args", $.string)
      ),
    function_arguments: ($) => list_of($._expression, ",", false),

    binary_expression: ($) =>
      choice(
        ...[
          ["or", PREC.OR],
          ["and", PREC.AND],
          ["<", PREC.COMPARE],
          ["<=", PREC.COMPARE],
          ["==", PREC.COMPARE],
          ["~=", PREC.COMPARE],
          [">=", PREC.COMPARE],
          [">", PREC.COMPARE],
          ["+", PREC.ADD],
          ["-", PREC.ADD],
          ["*", PREC.MULTI],
          ["/", PREC.MULTI],
          ["%", PREC.MULTI],
        ].map(([operator, precedence]) =>
          prec.left(precedence, seq($._expression, operator, $._expression))
        ),
        ...[
          ["..", PREC.CONCAT],
          ["^", PREC.EXP],
        ].map(([operator, precedence]) =>
          prec.right(precedence, seq($._expression, operator, $._expression))
        )
      ),

    unary_expression: ($) =>
      prec.left(PREC.UNARY, seq(choice("not", "#", "-"), $._expression)),

    // Primitives
    number: ($) => {
      const decimal_digits = /[0-9]+/;
      const signed_integer = seq(optional(choice("-", "+")), decimal_digits);
      const decimal_exponent_part = seq(choice("e", "E"), signed_integer);

      const decimal_integer_literal = choice(
        "0",
        seq(optional("0"), /[1-9]/, optional(decimal_digits))
      );

      const decimal_literal = choice(
        seq(
          decimal_integer_literal,
          ".",
          optional(decimal_digits),
          optional(decimal_exponent_part)
        ),
        seq(".", decimal_digits, optional(decimal_exponent_part)),
        seq(decimal_integer_literal, optional(decimal_exponent_part))
      );

      const hex_digits = /[a-fA-F0-9]+/;
      const hex_literal = seq(choice("0x", "0X"), hex_digits);

      const binary_digits = /[0-1]+/;
      const binary_literal = seq(choice("0b", "0B"), binary_digits);

      return token(choice(decimal_literal, hex_literal, binary_literal));
    },

    ellipse: ($) => "...",

    nil: ($) => "nil",
    boolean: ($) => choice("true", "false"),
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    left_paren: ($) => "(",
    right_paren: ($) => ")",

    // Comments
    comment: ($) => choice(seq("--", /.*\r?\n/), $._multiline_comment),
  },
});

function list_of(match, sep, trailing) {
  return trailing
    ? seq(match, repeat(seq(sep, match)), optional(sep))
    : seq(match, repeat(seq(sep, match)));
}
