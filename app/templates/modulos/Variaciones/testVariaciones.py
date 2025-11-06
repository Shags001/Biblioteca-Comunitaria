import itertools
import pytest

# /c:/Users/Nowe/Shags/Biblioteca-Comunitaria/app/templates/modulos/Variaciones/testVariaciones.py

def generate_variations(items, k):
    """
    Generate ordered k-length variations (permutations without repetition)
    from the iterable 'items'.
    Returns a list of tuples.
    """
    if not isinstance(k, int):
        raise TypeError("k must be an integer")
    if k < 0:
        raise ValueError("k must be non-negative")
    return list(itertools.permutations(items, k))

def to_list_of_lists(seq_of_tuples):
    return [list(t) for t in seq_of_tuples]

def test_basic_variations_length_and_content():
    items = [1, 2, 3]
    k = 2
    vars_ = generate_variations(items, k)
    assert len(vars_) == 6  # 3P2 = 6
    assert (1, 2) in vars_
    assert (2, 1) in vars_
    # order matters
    assert to_list_of_lists(vars_) == to_list_of_lists(list(itertools.permutations(items, k)))

def test_zero_k_returns_empty_tuple_variation():
    items = [10, 20]
    k = 0
    vars_ = generate_variations(items, k)
    assert vars_ == [()]  # one variation: empty tuple

def test_k_greater_than_n_returns_empty_list():
    items = [1, 2]
    k = 5
    vars_ = generate_variations(items, k)
    assert vars_ == []  # cannot choose 5 ordered distinct items from 2

def test_with_duplicate_items_treated_by_position():
    items = [1, 1, 2]
    k = 2
    vars_ = generate_variations(items, k)
    # permutations treats duplicate values as distinct by position
    assert len(vars_) == 6  # 3P2 = 6
    # ensure both positions of '1' appear in different tuples
    assert any(t[0] == 1 and t[1] == 1 for t in vars_)

def test_invalid_k_type_and_negative():
    with pytest.raises(TypeError):
        generate_variations([1,2,3], "2")
    with pytest.raises(ValueError):
        generate_variations([1,2,3], -1)

if __name__ == "__main__":
    # Allow running tests directly: python testVariaciones.py
    pytest.main([__file__])