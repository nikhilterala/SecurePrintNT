using BCrypt.Net;
using Microsoft.EntityFrameworkCore;
using SPS.Application.DTOs;
using SPS.Application.Services;
using SPS.Core.Entities;
using SPS.Infrastructure.Persistence;

namespace SPS.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly SpsDbContext _context;
    private readonly JwtTokenGenerator _jwtTokenGenerator;

    public AuthService(SpsDbContext context, JwtTokenGenerator jwtTokenGenerator)
    {
        _context = context;
        _jwtTokenGenerator = jwtTokenGenerator;
    }

    public async Task<LoginResponse> RegisterAsync(RegisterRequest request)
    {
        if (await _context.Users.AnyAsync(u => u.Email == request.Email))
        {
            throw new ArgumentException("User with this email already exists.");
        }

        var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        var user = new User(Guid.NewGuid(), request.Email, passwordHash, "User");

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var token = _jwtTokenGenerator.GenerateToken(user); 
        return new LoginResponse(token);
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest request)
    {
        var user = await _context.Users.SingleOrDefaultAsync(u => u.Email == request.Email);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedAccessException("Invalid credentials.");
        }

        var token = _jwtTokenGenerator.GenerateToken(user);
        return new LoginResponse(token);
    }
}
