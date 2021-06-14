const PREC = {
  PRIORTIY: 1,

  OR: 2,
  AND: 3,
  COMPARE: 4,
  CONCAT: 5,
  ADD: 6,
  MULTI: 7,
  UNARY: 8,
  POWER: 9,
};

module.exports = grammar({
  name: "luau",

  // External scanners to handle complex rules
  externals: ($) => [$._multiline_comment, $.string],

  // Tokens which can appear anywhere in the language.
  extras: ($) => [/[\r\n]/, /\s/, $.comment],

  conflicts: ($) => [[$._expression, $.function_call]],

  rules: {
    program: ($) => $._block,

    _statement: ($) =>
      choice(
        $.variable_assignment,
        $.function_call,
        $.do_statement,
        $.while_statement,
        $.repeat_statement,
        $.if_statement,
        $.numeric_for_statement,
        $.generic_for_statement,
        $.function_declaration,
        $.local_function_declaration,
        $.local_assignment,
        $.compound_assignment
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
    variable_assignment: ($) =>
      seq(
        field("variables", list_of($._var, ",", false)),
        "=",
        field("expressions", list_of($._expression, ",", false))
      ),

    do_statement: ($) =>
      seq(alias("do", $.do_token), optional($._block), $.end_token),

    while_statement: ($) =>
      seq(
        alias("while", $.while_token),
        $._expression,
        alias("do", $.do_token),
        optional($._block),
        $.end_token
      ),

    repeat_statement: ($) =>
      seq(
        alias("repeat", $.repeat_token),
        optional($._block),
        alias("until", $.until_token),
        $._expression
      ),

    if_statement: ($) =>
      seq(
        alias("if", $.if_token),
        $._expression,
        alias("then", $.then_token),
        $._block,
        repeat($.else_if_statement),
        optional($.else_statement),
        $.end_token
      ),
    else_if_statement: ($) =>
      seq(
        alias("elseif", $.else_if_token),
        $._expression,
        alias("then", $.then_token),
        $._block
      ),
    else_statement: ($) => seq(alias("else", $.else_token), $._block),

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
        $.end_token
      ),

    generic_for_statement: ($) =>
      seq(
        "for",
        field("names", list_of($.identifier, ",", false)),
        "in",
        field("expressions", list_of($._expression, ",", false)),
        "do",
        optional($._block),
        $.end_token
      ),

    function_declaration: ($) =>
      seq(
        alias("function", $.function_token),
        $.function_name,
        $._function_body
      ),

    function_name: ($) =>
      seq(list_of($.identifier, ".", false), optional(seq(":", $.identifier))),

    local_function_declaration: ($) =>
      seq(
        $.local_token,
        alias("function", $.function_token),
        $.identifier,
        $._function_body
      ),

    local_assignment: ($) =>
      seq(
        $.local_token,
        field("names", list_of($.identifier, ",", false)),
        optional(seq("=", list_of($._expression, ",", false)))
      ),

    compound_assignment: ($) =>
      seq(
        field("variable", $._var),
        $._compound_op,
        field("expression", $._expression)
      ),

    return_statement: ($) =>
      seq("return", optional(list_of($._expression, ","))),

    break_statement: ($) => "break",
    continue_statement: ($) => "continue",

    // Building blocks
    _var: ($) =>
      choice(
        $.identifier,
        seq($.prefix, "[", $._expression, "]"),
        seq($.prefix, ".", $.identifier)
      ),

    prefix: ($) =>
      choice(
        $._var,
        prec(-1, $.function_call),
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
        $.prefix,
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
        $.end_token
      ),

    parameter_list: ($) =>
      choice(
        seq(list_of($.identifier, ",", false), optional(seq(",", $.ellipse))),
        $.ellipse
      ),

    // Table
    table_constructor: ($) => seq("{", optional($.table_fields), "}"),
    table_fields: ($) => list_of($.field, $._field_separator, true),
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
    _field_separator: ($) => choice(",", ";"),

    // Function Call
    function_call: ($) =>
      prec.dynamic(
        PREC.PRIORTIY,
        seq($.prefix, choice($._args, $._method_call))
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
          ["^", PREC.POWER],
        ].map(([operator, precedence]) =>
          prec.right(precedence, seq($._expression, operator, $._expression))
        )
      ),

    unary_expression: ($) =>
      prec.left(PREC.UNARY, seq(choice("not", "#", "-"), $._expression)),

    // Primitives
    number: ($) => {
      const decimal_digits = seq(/[0-9_]+/);
      const signed_integer = seq(optional(choice("-", "+")), decimal_digits);
      const decimal_exponent = seq(choice("e", "E"), signed_integer);

      const decimal_integer_literal = choice(
        "0",
        seq(optional("0"), /[1-9]/, optional(decimal_digits))
      );

      const decimal_literal = choice(
        seq(
          decimal_integer_literal,
          ".",
          optional(decimal_digits),
          optional(decimal_exponent)
        ),
        seq(".", decimal_digits, optional(decimal_exponent)),
        seq(decimal_integer_literal, optional(decimal_exponent))
      );

      const hex_digits = /[a-fA-F0-9_]+/;
      const hex_literal = seq(choice("0x", "0X"), hex_digits);

      const binary_digits = /[0-1_]+/;
      const binary_literal = seq(choice("0b", "0B"), binary_digits);

      return token(choice(decimal_literal, hex_literal, binary_literal));
    },

    ellipse: ($) => "...",

    nil: ($) => "nil",
    boolean: ($) => choice("true", "false"),
    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    left_paren: ($) => "(",
    right_paren: ($) => ")",

    local_token: ($) => "local",
    end_token: ($) => "end",

    _compound_op: ($) => choice("+=", "-=", "*=", "/=", "%=", "^=", "..="),

    // Comments
    comment: ($) => choice(seq("--", /.*\r?\n/), $._multiline_comment),
  },
});

function list_of(match, sep, trailing) {
  return trailing
    ? seq(match, repeat(seq(sep, match)), optional(sep))
    : seq(match, repeat(seq(sep, match)));
}
